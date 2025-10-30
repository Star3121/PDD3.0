#!/usr/bin/env node
/*
  自动化迁移脚本：将数据从旧项目导出到新的 Supabase 项目。
  支持数据源：
  - OLD_SUPABASE_URL + OLD_SUPABASE_SERVICE_ROLE_KEY （推荐）
  - 或者 OLD_DB_TYPE=sqlite + LOCAL_SQLITE_PATH （回退方案）

  目标：
  - NEW_SUPABASE_URL + NEW_SUPABASE_SERVICE_ROLE_KEY

  说明：
  - 先在新 Supabase 项目中应用结构迁移（项目内 supabase/migrations/001-003）。
  - 导入完成后需应用 004_fix_sequences.sql 修复序列以避免主键冲突。
*/

import fs from 'fs';
import path from 'path';
import process from 'process';
import { createClient } from '@supabase/supabase-js';
import sqlite3 from 'sqlite3';

const TABLES = ['categories', 'templates', 'orders', 'designs'];
const CHUNK_SIZE = 500;

// 目标 Supabase（005 架构）允许的列白名单
const ALLOWED_COLUMNS = {
  categories: ['id', 'name', 'display_name', 'description', 'is_default', 'sort_order', 'created_at', 'updated_at'],
  templates: ['id', 'name', 'image_path', 'category', 'created_at'],
  orders: ['id', 'order_number', 'customer_name', 'phone', 'address', 'product_size', 'created_at', 'updated_at', 'product_category', 'product_model', 'product_specs', 'quantity', 'transaction_time', 'order_notes', 'mark', 'export_status', 'exported_at'],
  designs: ['id', 'order_id', 'name', 'canvas_data', 'preview_path', 'width', 'height', 'background_type', 'created_at', 'updated_at']
};

function sanitizeRow(table, row) {
  const allowed = ALLOWED_COLUMNS[table] || [];
  const out = {};
  for (const key of allowed) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  // 除订单外移除 id，让 BIGSERIAL 自动生成，避免主键冲突
  if (table !== 'orders') {
    delete out.id;
  }
  // 类型调整：布尔与数值
  if (table === 'categories') {
    if (out.is_default !== undefined) {
      out.is_default = !!(out.is_default === true || out.is_default === 1 || out.is_default === '1');
    }
    if (out.sort_order !== undefined) {
      out.sort_order = Number(out.sort_order) || 0;
    }
  }
  if (table === 'orders') {
    if (out.quantity !== undefined) {
      out.quantity = Number(out.quantity) || 1;
    }
  }
  if (table === 'designs') {
    // 设计稿中 canvas_data 可能很大，导入阶段先跳过以避免超时
    delete out.canvas_data;
    if (out.width !== undefined) out.width = Number(out.width) || 800;
    if (out.height !== undefined) out.height = Number(out.height) || 600;
  }
  // 时间字段清洗：将 'null' 或空字符串剔除，避免 TIMESTAMPTZ 解析错误
  const nullLike = v => v === null || v === undefined || (typeof v === 'string' && (v.trim().toLowerCase() === 'null' || v.trim() === ''));
  ['created_at','updated_at','exported_at'].forEach(k => {
    if (k in out && nullLike(out[k])) {
      delete out[k];
    }
  });
  return out;
}

function log(msg) { console.log(`[migrate] ${msg}`); }
function err(msg, e) { console.error(`[migrate] ${msg}`, e || ''); }

function requireEnv(keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`缺少环境变量: ${missing.join(', ')}`);
  }
}

async function fetchAllSupabase(supabase, table) {
  // 逐页拉取
  let from = 0; const size = 1000; let all = []; let done = false;
  while (!done) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) { done = true; break; }
    all = all.concat(data);
    if (data.length < size) { done = true; }
    from += size;
  }
  return all;
}

async function exportFromOldSupabase() {
  requireEnv(['OLD_SUPABASE_URL', 'OLD_SUPABASE_SERVICE_ROLE_KEY']);
  const supabase = createClient(process.env.OLD_SUPABASE_URL, process.env.OLD_SUPABASE_SERVICE_ROLE_KEY);
  const dump = {};
  for (const t of TABLES) {
    log(`导出表: ${t}`);
    dump[t] = await fetchAllSupabase(supabase, t);
    log(`表 ${t} 行数: ${dump[t].length}`);
  }
  return dump;
}

async function exportFromLocalSqlite() {
  requireEnv(['LOCAL_SQLITE_PATH']);
  const dbPath = process.env.LOCAL_SQLITE_PATH;
  if (!fs.existsSync(dbPath)) throw new Error(`sqlite 文件不存在: ${dbPath}`);
  const db = new sqlite3.Database(dbPath);
  const all = table => new Promise((resolve, reject) => {
    db.all(`SELECT * FROM ${table}`, [], (e, rows) => e ? reject(e) : resolve(rows));
  });
  const dump = {};
  for (const t of TABLES) {
    log(`导出表: ${t}`);
    dump[t] = await all(t);
    log(`表 ${t} 行数: ${dump[t].length}`);
  }
  db.close();
  return dump;
}

async function importToNewSupabase(dump) {
  requireEnv(['NEW_SUPABASE_URL', 'NEW_SUPABASE_SERVICE_ROLE_KEY']);
  const supabase = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SUPABASE_SERVICE_ROLE_KEY);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 方案A：清空新库数据，避免重复与外键冲突
  async function clearTables() {
    const order = ['designs', 'orders', 'templates', 'categories'];
    for (const t of order) {
      log(`清空表: ${t}`);
      const { error } = await supabase.from(t).delete().not('id', 'is', null);
      if (error) {
        const msg = String(error.message || '');
        // 若表不存在，跳过（说明未应用架构）
        if (msg.includes('relation') && msg.includes('does not exist')) {
          log(`表 ${t} 不存在，跳过清空。`);
          continue;
        }
        throw error;
      }
    }
  }

  await clearTables();

  // 1) 先导入 categories 和 templates
  for (const t of ['categories', 'templates']) {
    const rows = (dump[t] || []).map(r => sanitizeRow(t, r)).filter(r => Object.keys(r).length > 0);
    if (!rows.length) { log(`跳过空表: ${t}`); continue; }
    log(`导入表 ${t}, 行数: ${rows.length}`);
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from(t).insert(chunk, { returning: 'minimal' });
      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('duplicate key') || msg.includes('already exists')) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from(t).upsert(row, { returning: 'minimal' });
            if (e2) throw e2;
          }
        } else if (error.code === '57014' || msg.includes('statement timeout')) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from(t).insert(row, { returning: 'minimal' });
            if (e2) throw e2;
            await sleep(100);
          }
        } else {
          throw error;
        }
      }
    }
  }

  // 2) 导入 orders，并基于 order_number 建立旧ID -> 新ID 映射
  const ordersDump = (dump['orders'] || []).map(r => sanitizeRow('orders', r));
  const ordersFiltered = ordersDump.filter(r => Object.keys(r).length > 0);
  const oldIdToOrderNumber = new Map();
  for (const r of ordersDump) {
    if (r.id !== undefined && r.order_number) oldIdToOrderNumber.set(r.id, r.order_number);
  }

  if (ordersFiltered.length) {
    log(`导入表 orders, 行数: ${ordersFiltered.length}`);
    for (let i = 0; i < ordersFiltered.length; i += CHUNK_SIZE) {
      const chunk = ordersFiltered.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('orders').upsert(chunk, { returning: 'minimal', onConflict: 'order_number' });
      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('duplicate key') || msg.includes('already exists')) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('orders').upsert(row, { returning: 'minimal', onConflict: 'order_number' });
            if (e2) throw e2;
          }
        } else if (error.code === '57014' || msg.includes('statement timeout')) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('orders').upsert(row, { returning: 'minimal', onConflict: 'order_number' });
            if (e2) throw e2;
            await sleep(100);
          }
        } else {
          throw error;
        }
      }
    }
  }

  // 查询新库 orders，构建 order_number -> newId 映射
  const allNewOrders = await fetchAllSupabase(supabase, 'orders');
  const orderNumberToNewId = new Map();
  for (const r of allNewOrders) {
    if (r.order_number && r.id !== undefined) orderNumberToNewId.set(r.order_number, r.id);
  }
  const oldIdToNewId = new Map();
  for (const [oldId, ordNo] of oldIdToOrderNumber.entries()) {
    if (orderNumberToNewId.has(ordNo)) oldIdToNewId.set(oldId, orderNumberToNewId.get(ordNo));
  }

  // 3) 导入 designs，修正外键
  const designsDump = (dump['designs'] || []).map(r => sanitizeRow('designs', r));
  const designsPatched = [];
  for (const d of designsDump) {
    if (d.order_id !== undefined) {
      const newId = oldIdToNewId.get(d.order_id);
      if (!newId) {
        // 若找不到映射则跳过该设计稿，避免外键错误
        continue;
      }
      d.order_id = newId;
    }
    designsPatched.push(d);
  }

  if (designsPatched.length) {
    log(`导入表 designs, 行数: ${designsPatched.length}`);
    const chunkSize = 10;
    for (let i = 0; i < designsPatched.length; i += chunkSize) {
      const chunk = designsPatched.slice(i, i + chunkSize);
      const { error } = await supabase.from('designs').insert(chunk, { returning: 'minimal' });
      if (error) {
        const msg = String(error.message || '');
        if (error.code === '57014' || msg.includes('statement timeout')) {
          log('检测到 designs 导入超时，退化为逐行插入');
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('designs').insert(row, { returning: 'minimal' });
            if (e2) throw e2;
            await sleep(100);
          }
        } else if (msg.includes('duplicate key') || msg.includes('already exists')) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('designs').upsert(row, { returning: 'minimal' });
            if (e2) throw e2;
          }
        } else {
          throw error;
        }
      }
    }
  }

  log('导入完成。请在新项目中应用 004_fix_sequences.sql 以修复主键序列。');
}

async function main() {
  try {
    const source = process.env.OLD_DB_TYPE === 'sqlite' ? 'sqlite' : 'supabase';
    log(`数据源: ${source}`);

    const dump = source === 'sqlite' ? await exportFromLocalSqlite() : await exportFromOldSupabase();

    // 将导出数据也保存成备份文件
    const outPath = path.join(process.cwd(), 'migration_dump.json');
    fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
    log(`已写入备份文件: ${outPath}`);

    await importToNewSupabase(dump);

    log('全部完成。');
  } catch (e) {
    err('迁移失败', e);
    process.exitCode = 1;
  }
}

main();