import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database.sqlite');

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found at:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

async function getData(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function main() {
    try {
        console.log('Generating static data...');
        
        // 确保表存在
        try {
            await getData('SELECT 1 FROM templates LIMIT 1');
        } catch (e) {
            console.log('Templates table likely does not exist yet. Skipping generation.');
            return;
        }

        const templates = await getData('SELECT * FROM templates ORDER BY created_at DESC');
        
        let categories = [];
        try {
            categories = await getData('SELECT * FROM categories ORDER BY sort_order ASC');
        } catch (e) {
            console.log('Categories table not found, using empty array.');
        }
        
        const outputDir = path.join(process.cwd(), 'public/data');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const data = {
            templates,
            categories,
            generatedAt: new Date().toISOString()
        };

        fs.writeFileSync(path.join(outputDir, 'templates.json'), JSON.stringify(data, null, 2));
        console.log(`Successfully generated public/data/templates.json with ${templates.length} templates and ${categories.length} categories.`);
    } catch (err) {
        console.error('Error generating static data:', err);
        process.exit(1);
    } finally {
        db.close();
    }
}

main();
