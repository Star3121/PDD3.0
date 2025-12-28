import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersAPI, uploadAPI, designsAPI } from '../api';
import { Order, PaginatedResponse } from '../api/index';
import Layout from '../components/Layout';
import OrderEditModal from '../components/OrderEditModal';
import ExportConfirmModal from '../components/ExportConfirmModal';
import Pagination from '../components/Pagination';
import { formatRelativeTime, formatYMDHM, buildImageUrl } from '../lib/utils';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { compressImageForHTML, getImageBlob, getExtensionFromBlob, sanitizeFilename } from '../lib/imageUtils';
import { renderCanvasToHighResImage, dataUrlToBlob, getBlobExtension } from '../lib/canvasRenderer';
import { toast } from 'react-hot-toast';

const OrderList: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState(""); // 新增：用于绑定输入框的中间状态
  const [markFilter, setMarkFilter] = useState<'all' | 'pending_design' | 'pending_confirm' | 'confirmed' | 'exported'>('all');
  
  // 导出时间筛选相关状态
  const [exportTimeFilter, setExportTimeFilter] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  // const [allOrdersForCounting, setAllOrdersForCounting] = useState<Order[]>([]);
  const [designPreviews, setDesignPreviews] = useState<Record<number, string>>({});
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [updatingMarks, setUpdatingMarks] = useState<Set<number>>(new Set());
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  
  // 导出相关状态
  const [showExportConfirmModal, setShowExportConfirmModal] = useState(false);
  const [exportingOrders, setExportingOrders] = useState<Order[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  
  // 列表过渡效果状态
  const [listVisible, setListVisible] = useState(true);
  
  const navigate = useNavigate();



  const markStyles = {
    pending_design: 'bg-orange-100 text-orange-800',
    pending_confirm: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
    exported: 'bg-purple-100 text-purple-800',
    default: 'bg-gray-100 text-gray-800'
  };

  const markLabels = {
    pending_design: '待出图',
    pending_confirm: '待确认',
    confirmed: '已确认',
    exported: '已导出'
  };

  // 时间筛选辅助函数（使用东八区时间）
  const isToday = (dateString: string) => {
    if (!dateString) return false;
    // 数据库中的时间是东八区时间格式 "YYYY-MM-DD HH:mm:ss"
    // 系统已经是东八区，直接解析即可
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return dateOnly.getTime() === today.getTime();
  };

  const isYesterday = (dateString: string) => {
    if (!dateString) return false;
    // 数据库中的时间是东八区时间格式 "YYYY-MM-DD HH:mm:ss"
    // 系统已经是东八区，直接解析即可
    const date = new Date(dateString);
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    yesterday.setDate(yesterday.getDate() - 1);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return dateOnly.getTime() === yesterday.getTime();
  };

  const isInCustomRange = (dateString: string) => {
    if (!dateString || !customDateRange.startDate || !customDateRange.endDate) return false;
    // 数据库中的时间是东八区时间格式 "YYYY-MM-DD HH:mm:ss"
    // 系统已经是东八区，直接解析即可
    const date = new Date(dateString);
    const startDate = new Date(customDateRange.startDate + 'T00:00:00');
    const endDate = new Date(customDateRange.endDate + 'T23:59:59');
    return date >= startDate && date <= endDate;
  };

  const [markCounts, setMarkCounts] = useState({
    total: 0,
    pending_design: 0,
    pending_confirm: 0,
    confirmed: 0,
    exported: 0,
    exportedToday: 0,
    exportedYesterday: 0,
    exportedCustom: 0
  });

  // 现在过滤在后端进行，orders 就是当前页的过滤结果
  const filteredOrders = orders;

  const getAvatarText = (name: string) => (name && name[0]) ? name[0].toUpperCase() : '?';

  // 初始加载和主要筛选条件变化时显示loading
  useEffect(() => {
    fetchOrders(true);
  }, [currentPage, pageSize, searchQuery, markFilter]);

  // 时间筛选变化时不显示loading，避免闪屏
  useEffect(() => {
    if (markFilter === 'exported') {
      fetchOrders(false);
    }
  }, [exportTimeFilter, customDateRange]);

  useEffect(() => {
    // 获取全量数据用于统计
    fetchAllOrdersForCounting();
  }, [customDateRange]); // 添加 customDateRange 依赖，当时间范围变化时重新获取统计



  const fetchAllOrdersForCounting = async () => {
    try {
      // 使用新的统计API
      const stats = await ordersAPI.getStats(
        customDateRange.startDate,
        customDateRange.endDate
      );
      setMarkCounts(stats);
    } catch (error) {
      console.error('获取订单统计数据失败:', error);
    }
  };

  const fetchOrders = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      } else {
        // 时间筛选时使用淡出效果
        setListVisible(false);
      }
      const params: any = {
        page: currentPage,
        pageSize,
        search: searchQuery,
        mark: markFilter === 'all' ? '' : markFilter,
        sortBy: 'created_at',
        sortOrder: 'DESC'
      };

      // 添加导出时间筛选参数（仅在已导出状态下生效）
      if (markFilter === 'exported' && exportTimeFilter !== 'all') {
        params.exportTimeFilter = exportTimeFilter;
        if (exportTimeFilter === 'custom' && customDateRange.startDate && customDateRange.endDate) {
          params.exportStartDate = customDateRange.startDate;
          params.exportEndDate = customDateRange.endDate;
        }
      }
      
      const response = await ordersAPI.getAll(params);
      
      let currentOrders: Order[];
      if ('data' in response) {
        // 新的分页API响应格式
        currentOrders = response.data;

        setOrders(response.data);
        setTotal(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
      } else {
        // 兼容旧的API响应格式
        currentOrders = response;

        setOrders(response);
        setTotal(response.length);
        setTotalPages(Math.ceil(response.length / pageSize));
      }
      // 拉取每个订单的最新设计预览（只获取还没有缓存的）
      const previews: Record<number, string> = { ...designPreviews };
      const ordersNeedingPreviews = currentOrders.filter(o => !previews[o.id]);
      
      if (ordersNeedingPreviews.length > 0) {
        await Promise.all(
          ordersNeedingPreviews.map(async (o) => {
            try {
              const designs = await designsAPI.getByOrderId(o.id);
              if (Array.isArray(designs) && designs.length > 0) {
                // 选择最近更新且有预览图的设计
                const withPreview = designs.filter(d => !!d.preview_path);
                const target = (withPreview.length > 0 ? withPreview : designs)
                  .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0];
                if (target?.preview_path) {
                  previews[o.id] = buildImageUrl(target.preview_path);
                }
              }
            } catch (e) {
              console.warn('获取设计预览失败:', e);
            }
          })
        );
      }
      setDesignPreviews(previews);
    } catch (error) {
      console.error('获取订单列表失败:', error);
      alert('获取订单列表失败');
    } finally {
      setLoading(false);
      // 恢复列表可见性，触发淡入效果
      setTimeout(() => setListVisible(true), 50);
    }
  };

  const handleSelectOrder = (orderId: number) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      // 如果已全选，则取消全选
      setSelectedOrders(new Set());
    } else {
      // 否则全选当前页的订单
      const allIds = new Set(orders.map(order => order.id));
      setSelectedOrders(allIds);
    }
  };

  // 分页处理函数
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedOrders(new Set()); // 切换页面时清空选择
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // 重置到第一页
    setSelectedOrders(new Set()); // 清空选择
  };

  // 搜索处理函数
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // 重置到第一页
    setSelectedOrders(new Set()); // 清空选择
  };

  // 筛选处理函数
  const handleMarkFilterChange = (mark: 'all' | 'pending_design' | 'pending_confirm' | 'confirmed' | 'exported') => {
    setMarkFilter(mark);
    setCurrentPage(1); // 重置到第一页
    setSelectedOrders(new Set()); // 清空选择
    
    // 如果不是已导出状态，重置导出时间筛选
    if (mark !== 'exported') {
      setExportTimeFilter('all');
      setShowDatePicker(false);
      setCustomDateRange({ startDate: '', endDate: '' });
    }
  };

  // 导出时间筛选处理函数
  const handleExportTimeFilterChange = (filter: 'all' | 'today' | 'yesterday' | 'custom') => {
    setExportTimeFilter(filter);
    setCurrentPage(1); // 重置到第一页
    
    if (filter === 'custom') {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
      setCustomDateRange({ startDate: '', endDate: '' });
    }
  };

  const handleCustomDateRangeChange = (startDate: string, endDate: string) => {
    setCustomDateRange({ startDate, endDate });
    setCurrentPage(1); // 重置到第一页
  };

  // 处理导出选中订单
  const handleExportSelected = async () => {
    const selectedOrdersList = orders.filter(order => selectedOrders.has(order.id));
    
    // 检查是否包含已导出的订单
    const exportedCount = selectedOrdersList.filter(order => order.export_status === 'exported').length;
    const notExportedCount = selectedOrdersList.length - exportedCount;
    
    if (exportedCount > 0) {
      // 显示确认模态框
      setExportingOrders(selectedOrdersList);
      setShowExportConfirmModal(true);
    } else {
      // 直接导出
      await performExport(selectedOrdersList);
    }
  };

  // 确认重新导出
  const handleExportConfirmOverwrite = async () => {
    setShowExportConfirmModal(false);
    await performExport(exportingOrders);
  };

  // 执行导出
  const performExport = async (ordersToExport: Order[]) => {
    if (ordersToExport.length === 0) {
      toast.error('没有选择要导出的订单');
      return;
    }

    setIsExporting(true);
    
    try {
      const zip = new JSZip();
      const today = new Date().toISOString().split('T')[0];
      
      // 生成收件信息.txt
      let recipientInfo = '';
      ordersToExport.forEach((order, index) => {
        const orderNumber = String(index + 1).padStart(2, '0');
        const recipientData = `${order.customer_name} ${order.phone} ${order.address}`;
        recipientInfo += `${orderNumber} 收件信息：${recipientData}\n\n`;
      });
      zip.file('收件信息.txt', recipientInfo);
      
      // 生成订单对账表.html
      const htmlContent = await generateOrderHTML(ordersToExport);
      zip.file('订单对账表.html', htmlContent);
      
      // 生成订单详情(无图).xlsx
      const xlsxBuffer = generateOrderXLSX(ordersToExport);
      zip.file('订单详情(无图).xlsx', xlsxBuffer);
      
      // 处理图片文件
      await processOrderImages(zip, ordersToExport);
      
      // 生成ZIP文件并下载
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `系统2订单导出_${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // 更新订单状态为已导出
      await updateOrdersExportStatus(ordersToExport.map(order => order.id));
      
      // 清空选择
      setSelectedOrders(new Set());
      
      toast.success(`成功导出 ${ordersToExport.length} 个订单`);
      
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // 生成订单对账表HTML
  const generateOrderHTML = async (ordersToExport: Order[]): Promise<string> => {
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>订单对账表</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .order-item { margin-bottom: 30px; }
    .order-header { background-color: #e8f4f8; font-weight: bold; }
    .image-container { text-align: center; }
    .thumbnail { max-width: 200px; max-height: 200px; }
  </style>
</head>
<body>
  <h1>订单对账表</h1>
`;

    for (let i = 0; i < ordersToExport.length; i++) {
      const order = ordersToExport[i];
      const orderNumber = String(i + 1).padStart(2, '0');
      const recipientData = `${order.customer_name} ${order.phone} ${order.address}`;
      
      htmlContent += `
  <div class="order-item">
    <h3>订单 ${orderNumber}</h3>
    <table>
      <tr class="order-header">
        <td>订单编号</td>
        <td>${order.order_number}</td>
      </tr>
      <tr>
        <td>产品型号</td>
        <td>${order.product_model || '未填写'}</td>
      </tr>
      <tr>
        <td>产品规格</td>
        <td>${order.product_specs || '未填写'}</td>
      </tr>
      <tr>
        <td>数量</td>
        <td>${order.quantity || 1}</td>
      </tr>
      <tr>
        <td>收件信息</td>
        <td>${recipientData}</td>
      </tr>
      ${order.order_notes ? `<tr><td>订单备注</td><td>${order.order_notes}</td></tr>` : ''}
    </table>
`;

      // 获取订单的设计图片
      try {
        const designs = await designsAPI.getByOrderId(order.id);
        if (designs && designs.length > 0) {
          const validDesigns = designs.filter(d => d.canvas_data && d.canvas_data !== '{}');
          if (validDesigns.length > 0) {
            htmlContent += `<div class="image-container">`;
            for (const design of validDesigns) {
              try {
                // 使用高分辨率画布渲染生成图片
                const highResDataUrl = await renderCanvasToHighResImage(
                  design.canvas_data,
                  'white', // 使用白色背景
                  false // HTML中使用中等分辨率即可，避免文件过大
                );
                
                // 压缩图片用于HTML显示
                const compressedImage = await compressImageForHTML(highResDataUrl, 400, 0.8);
                htmlContent += `<img src="${compressedImage}" alt="确认图片" class="thumbnail" style="margin: 5px;">`;
              } catch (error) {
                console.warn('高分辨率图片生成失败，尝试使用预览图:', error);
                
                // 回退到使用预览图
                if (design.preview_path) {
                  try {
                    const imageUrl = buildImageUrl(design.preview_path);
                    const compressedImage = await compressImageForHTML(imageUrl);
                    htmlContent += `<img src="${compressedImage}" alt="确认图片" class="thumbnail" style="margin: 5px;">`;
                  } catch (fallbackError) {
                    console.warn('预览图也失败:', fallbackError);
                    htmlContent += `<div style="margin: 5px; padding: 20px; border: 1px dashed #ccc; text-align: center; color: #666;">图片加载失败</div>`;
                  }
                }
              }
            }
            htmlContent += `</div>`;
          } else {
            htmlContent += `<p>无确认图片</p>`;
          }
        } else {
          htmlContent += `<p>无确认图片</p>`;
        }
      } catch (error) {
        console.warn('获取设计图片失败:', error);
        htmlContent += `<p>无确认图片</p>`;
      }

      htmlContent += `</div>`;
    }

    htmlContent += `
</body>
</html>`;

    return htmlContent;
  };

  // 生成订单详情XLSX
  const generateOrderXLSX = (ordersToExport: Order[]): ArrayBuffer => {
    const worksheetData = [
      ['订单编号', '客户名字', '收件信息', '产品型号', '产品规格', '数量', '备注']
    ];

    ordersToExport.forEach(order => {
      const recipientData = `${order.customer_name} ${order.phone} ${order.address}`;
      worksheetData.push([
        order.order_number,
        order.customer_name,
        recipientData,
        order.product_model || '',
        order.product_specs || '',
        String(order.quantity || 1),
        order.order_notes || ''
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '订单详情');
    
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  };

  // 处理订单图片
  const processOrderImages = async (zip: JSZip, ordersToExport: Order[]) => {
    for (let i = 0; i < ordersToExport.length; i++) {
      const order = ordersToExport[i];
      const orderNumber = String(i + 1).padStart(2, '0');
      
      try {
        const designs = await designsAPI.getByOrderId(order.id);
        if (designs && designs.length > 0) {
          // 过滤有canvas_data的设计
          const validDesigns = designs.filter(d => d.canvas_data && d.canvas_data !== '{}');
          
          for (let j = 0; j < validDesigns.length; j++) {
            const design = validDesigns[j];
            
            try {
              // 使用高分辨率画布渲染生成图片，使用设计保存时选择的背景类型
              const backgroundType = (design.background_type as 'white' | 'transparent') || 'white'; // 默认白色背景
              const highResDataUrl = await renderCanvasToHighResImage(
                design.canvas_data,
                backgroundType, // 使用设计保存时选择的背景类型
                true // 使用高分辨率以匹配画布下载质量
              );
              
              // 转换为Blob
              const imageBlob = dataUrlToBlob(highResDataUrl);
              const extension = getBlobExtension(imageBlob);
              const productSpecs = sanitizeFilename(order.product_specs || '默认规格');
              
              let filename: string;
              if (validDesigns.length === 1) {
                filename = `${orderNumber}+${productSpecs}.${extension}`;
              } else {
                const suffix = String.fromCharCode(97 + j); // a, b, c...
                filename = `${orderNumber}${suffix}+${productSpecs}.${extension}`;
              }
              
              zip.file(filename, imageBlob);
            } catch (error) {
              console.warn(`生成高分辨率图片失败 (订单${orderNumber}, 设计${j+1}):`, error);
              
              // 回退到使用预览图
              if (design.preview_path) {
                try {
                  const imageUrl = buildImageUrl(design.preview_path);
                  const imageBlob = await getImageBlob(imageUrl);
                  const extension = getExtensionFromBlob(imageBlob);
                  const productSpecs = sanitizeFilename(order.product_specs || '默认规格');
                  
                  let filename: string;
                  if (validDesigns.length === 1) {
                    filename = `${orderNumber}+${productSpecs}_preview.${extension}`;
                  } else {
                    const suffix = String.fromCharCode(97 + j);
                    filename = `${orderNumber}${suffix}+${productSpecs}_preview.${extension}`;
                  }
                  
                  zip.file(filename, imageBlob);
                } catch (fallbackError) {
                  console.warn(`回退预览图也失败 (订单${orderNumber}, 设计${j+1}):`, fallbackError);
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`获取订单${orderNumber}的设计失败:`, error);
      }
    }
  };

  // 更新订单导出状态
  const updateOrdersExportStatus = async (orderIds: number[]) => {
    try {
      await ordersAPI.batchUpdateExportStatus(orderIds, 'exported');
      
      // 更新本地状态
      setOrders(prevOrders => 
        prevOrders.map(order => 
          orderIds.includes(order.id) 
            ? { ...order, export_status: 'exported' as const, exported_at: new Date().toISOString(), mark: 'exported' as const }
            : order
        )
      );
      
      // 更新统计数据
      await fetchAllOrdersForCounting();
    } catch (error) {
      console.error('更新订单导出状态失败:', error);
      toast.error('更新订单状态失败');
    }
  };

  const handleMarkChange = async (orderId: number, newMark: 'pending_design' | 'pending_confirm' | 'confirmed' | 'exported') => {
    // 添加到更新中的订单集合
    setUpdatingMarks(prev => new Set(prev).add(orderId));
    
    try {
      // 更新订单标记
      const updatedOrder = await ordersAPI.update(orderId, { mark: newMark });
      
      // 更新本地状态，包括updated_at时间（使用东八区时间）
      const beijingTime = new Date();
      beijingTime.setHours(beijingTime.getHours() + 8);
      const currentTime = beijingTime.toISOString().replace('T', ' ').substring(0, 19);
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId ? { ...order, mark: newMark, updated_at: currentTime } : order
        )
      );
    } catch (error) {
      console.error('更新订单标记失败:', error);
      alert('更新订单标记失败');
    } finally {
      // 从更新中的订单集合中移除
      setUpdatingMarks(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingOrder(null);
  };

  const handleSaveOrder = async (updatedOrderData: Partial<Order>) => {
    if (!editingOrder) return;

    try {
      // 确保所有必需字段都存在
      const updateData = {
        order_number: updatedOrderData.order_number || editingOrder.order_number,
        customer_name: updatedOrderData.customer_name || editingOrder.customer_name,
        phone: updatedOrderData.phone || editingOrder.phone,
        address: updatedOrderData.address || editingOrder.address,
        product_size: updatedOrderData.product_size || editingOrder.product_size,
        mark: updatedOrderData.mark || editingOrder.mark
      };

      const updatedOrder = await ordersAPI.update(editingOrder.id, updateData);
      
      // 更新本地状态
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === editingOrder.id ? updatedOrder : order
        )
      );
      
      alert('订单更新成功');
    } catch (error) {
      console.error('更新订单失败:', error);
      throw error; // 让弹窗组件处理错误
    }
  };

  const handleDeleteOrder = (order: Order) => {
    setDeletingOrder(order);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setDeletingOrder(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingOrder) return;

    try {
      await ordersAPI.delete(deletingOrder.id);
      
      // 更新本地状态，移除已删除的订单
      setOrders(prevOrders => 
        prevOrders.filter(order => order.id !== deletingOrder.id)
      );
      
      // 如果删除的订单在选中列表中，也要移除
      setSelectedOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(deletingOrder.id);
        return newSet;
      });
      
      alert('订单删除成功');
      handleCloseDeleteModal();
    } catch (error) {
      console.error('删除订单失败:', error);
      alert('删除订单失败');
    }
  };

  const handleBatchDelete = () => {
    if (selectedOrders.size === 0) return;
    setIsBatchDeleteModalOpen(true);
  };

  const handleCloseBatchDeleteModal = () => {
    setIsBatchDeleteModalOpen(false);
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedOrders.size === 0) return;

    setBatchDeleting(true);
    try {
      const idsToDelete = Array.from(selectedOrders);
      const result = await ordersAPI.batchDelete(idsToDelete);
      
      // 更新本地状态，移除已删除的订单
      setOrders(prevOrders => 
        prevOrders.filter(order => !selectedOrders.has(order.id))
      );
      
      // 清空选中列表
      setSelectedOrders(new Set());
      
      alert(`成功删除 ${result.deletedCount} 个订单`);
      handleCloseBatchDeleteModal();
    } catch (error) {
      console.error('批量删除订单失败:', error);
      alert('批量删除订单失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  return (
    <Layout title="订单管理">
      <div className="space-y-6">
        {/* 顶部操作栏 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* 左侧：操作按钮组 */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/orders/new')}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新建订单
              </button>

              {orders.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 shadow-sm transition-colors border border-gray-300"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {selectedOrders.size === orders.length ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                  </svg>
                  {selectedOrders.size === orders.length ? '取消全选' : '全选'}
                </button>
              )}
              
              {selectedOrders.size > 0 && (
                <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
                  <span className="text-sm text-gray-600 font-medium">
                    已选择 {selectedOrders.size} 项
                  </span>
                  <button
                    onClick={handleExportSelected}
                    disabled={isExporting}
                    className="inline-flex items-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExporting ? (
                      <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {isExporting ? '导出中...' : '导出'}
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    className="inline-flex items-center px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-sm transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    删除
                  </button>
                </div>
              )}
            </div>

            {/* 右侧：搜索和统计 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="搜索订单/客户/电话/地址"
                  className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                {searchInput && (
                  <button
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute inset-y-0 right-10 pr-3 flex items-center"
                  >
                    <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleSearchSubmit}
                  className="absolute inset-y-0 right-0 px-3 flex items-center bg-blue-600 rounded-r-lg hover:bg-blue-700 transition-colors"
                  title="搜索"
                >
                  <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
              <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border">
                共 <span className="font-semibold text-gray-900">{total}</span> 个订单
              </div>
            </div>
          </div>

          {/* 状态筛选标签 */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700 mr-2">状态筛选:</span>
              {([
                { key: 'all', label: '全部', count: markCounts.total },
                { key: 'pending_design', label: '待出图', count: markCounts.pending_design },
                { key: 'pending_confirm', label: '待确认', count: markCounts.pending_confirm },
                { key: 'confirmed', label: '已确认', count: markCounts.confirmed },
                { key: 'exported', label: '已导出', count: markCounts.exported },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleMarkFilterChange(tab.key as any)}
                  className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${
                    markFilter === tab.key
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                    markFilter === tab.key
                      ? 'bg-blue-500 text-blue-100'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* 导出时间筛选（仅在已导出状态下显示） */}
            {markFilter === 'exported' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 mr-2">时间筛选:</span>
                  {([
                    { key: 'all', label: '全部', count: markCounts.exported },
                    { key: 'today', label: '当天导出', count: markCounts.exportedToday },
                    { key: 'yesterday', label: '昨日导出', count: markCounts.exportedYesterday },
                    { key: 'custom', label: '时间范围', count: markCounts.exportedCustom },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => handleExportTimeFilterChange(tab.key)}
                      className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${
                        exportTimeFilter === tab.key
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      {tab.label}
                      <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                        exportTimeFilter === tab.key
                          ? 'bg-purple-500 text-purple-100'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* 自定义日期范围选择器 */}
                {showDatePicker && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">选择日期范围:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={customDateRange.startDate}
                          onChange={(e) => handleCustomDateRangeChange(e.target.value, customDateRange.endDate)}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                        <span className="text-sm text-gray-500">至</span>
                        <input
                          type="date"
                          value={customDateRange.endDate}
                          onChange={(e) => handleCustomDateRangeChange(customDateRange.startDate, e.target.value)}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 bg-gray-200 rounded"></div>
                    <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
                    <div>
                      <div className="h-4 w-32 bg-gray-200 rounded"></div>
                      <div className="mt-1 h-3 w-24 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  <div className="h-5 w-16 bg-gray-200 rounded-full"></div>
                </div>
                <div className="mt-3 h-3 w-40 bg-gray-200 rounded"></div>
                <div className="mt-2 h-3 w-24 bg-gray-200 rounded"></div>
                <div className="mt-4 flex justify-end gap-2">
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">ℹ️</div>
            <h3 className="mt-4 text-base font-semibold text-gray-900">{total === 0 ? '暂无订单' : '没有符合条件的订单'}</h3>
            <p className="mt-1 text-sm text-gray-500">{total === 0 ? '点击下方按钮创建你的第一条订单。' : '请尝试调整搜索或状态筛选条件。'}</p>
            <div className="mt-6">
              <button
                onClick={() => navigate('/orders/new')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm"
              >
                新建订单
              </button>
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity duration-300 ease-in-out ${listVisible ? 'opacity-100' : 'opacity-0'}`}>
            {orders.map((order) => (
              <div key={order.id} className="card p-4 hover:shadow-lg transition-all duration-200 bg-white flex flex-col transform hover:scale-[1.02]">
                {/* 主要内容区域 */}
                <div className="flex gap-3 flex-1">
                  {/* 左侧内容区域 */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    {/* 顶部：复选框、头像、基本信息 */}
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                        className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="h-7 w-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-semibold border border-blue-200 text-xs flex-shrink-0">
                        {getAvatarText(order.customer_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">订单号: {order.order_number}</div>
                        <div className="text-xs text-gray-600 truncate">{order.customer_name} · {order.phone}</div>
                      </div>
                    </div>

                    {/* 状态标记和更新时间 */}
                    <div className="mb-2 flex items-center gap-1">
                      <select
                        value={order.mark || 'pending_design'}
                        onChange={(e) => handleMarkChange(order.id, e.target.value as any)}
                        className={`px-2 py-0.5 text-xs rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 hover:shadow-sm font-medium w-auto ${
                          updatingMarks.has(order.id) 
                            ? 'opacity-50 cursor-wait' 
                            : markStyles[order.mark] || markStyles.default
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        title="点击修改订单标记"
                        disabled={updatingMarks.has(order.id)}
                      >
                        <option value="pending_design">待出图</option>
                        <option value="pending_confirm">待确认</option>
                        <option value="confirmed">已确认</option>
                        <option value="exported">已导出</option>
                      </select>
                      <div 
                        className="flex items-center text-gray-400 cursor-help"
                        title={`更新时间: ${formatYMDHM(order.updated_at)}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>

                    {/* 订单详情 */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs text-gray-500 font-medium flex-shrink-0">地址:</span>
                        <span className="text-xs text-gray-700 break-words leading-relaxed">{order.address}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 font-medium">尺寸:</span>
                          <span className="text-xs text-gray-700">{order.product_size}</span>
                        </div>
                        <div 
                          className="flex items-center text-gray-400 cursor-help" 
                          title={`创建时间: ${formatYMDHM(order.created_at)}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右侧预览图区域 - 3:4 比例 */}
                  {designPreviews[order.id] && (
                    <div className="w-16 flex-shrink-0">
                      <div className="w-16 h-[85px] rounded-lg border border-gray-200 overflow-hidden bg-gray-50 shadow-sm">
                        <img
                          src={designPreviews[order.id]}
                          alt="设计预览"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按钮 - 固定在卡片底部 */}
                <div className="flex gap-1.5 pt-3 mt-auto border-t border-gray-100">
                  <button
                    onClick={() => navigate(`/design/${order.id}`)}
                    className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-colors duration-200 font-medium"
                  >
                    设计
                  </button>
                  <button
                    onClick={() => navigate(`/preview/${order.id}`)}
                    className="flex-1 px-2 py-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100 shadow-sm transition-colors duration-200 font-medium"
                  >
                    预览
                  </button>
                  <button
                    onClick={() => handleEditOrder(order)}
                    className="flex-1 px-2 py-1 text-xs bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-colors duration-200 font-medium"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDeleteOrder(order)}
                    className="flex-1 px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 hover:border-red-300 shadow-sm transition-colors duration-200 font-medium"
                    title="删除订单"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页组件 */}
      {total > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[20, 40, 80]}
          />
        </div>
      )}

      {/* 编辑订单弹窗 */}
      <OrderEditModal
        order={editingOrder}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveOrder}
      />

      {/* 删除确认对话框 */}
      {isDeleteModalOpen && deletingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">确认删除订单</h3>
                <p className="text-sm text-gray-600">此操作无法撤销</p>
              </div>
            </div>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm">
                <div className="font-medium text-gray-900 mb-1">订单号: {deletingOrder.order_number}</div>
                <div className="text-gray-600">客户: {deletingOrder.customer_name}</div>
                <div className="text-gray-600">电话: {deletingOrder.phone}</div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseDeleteModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量删除确认对话框 */}
      {isBatchDeleteModalOpen && selectedOrders.size > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">确认批量删除订单</h3>
                <p className="text-sm text-gray-600">此操作无法撤销</p>
              </div>
            </div>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm">
                <div className="font-medium text-gray-900 mb-2">
                  即将删除 {selectedOrders.size} 个订单:
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {orders
                    .filter(order => selectedOrders.has(order.id))
                    .map(order => (
                      <div key={order.id} className="text-gray-600 text-xs">
                        {order.order_number} - {order.customer_name}
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseBatchDeleteModal}
                disabled={batchDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {batchDeleting ? '删除中...' : `确认删除 ${selectedOrders.size} 个订单`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出确认模态框 */}
      <ExportConfirmModal
        isOpen={showExportConfirmModal}
        onClose={() => setShowExportConfirmModal(false)}
        onConfirm={handleExportConfirmOverwrite}
        exportedCount={exportingOrders.filter(order => order.export_status === 'exported').length}
        notExportedCount={exportingOrders.filter(order => order.export_status !== 'exported').length}
        totalCount={exportingOrders.length}
      />
    </Layout>
  );
};

export default OrderList;