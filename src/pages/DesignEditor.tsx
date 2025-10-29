import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI, designsAPI, templatesAPI, uploadAPI } from '../api';
import { Order, Design, Template } from '../api/index';
import CanvasEditor, { CanvasEditorRef } from '../components/CanvasEditor';
import CanvasTemplateLibrary from '../components/CanvasTemplateLibrary';
import Layout from '../components/Layout';

const DesignEditor: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [currentDesign, setCurrentDesign] = useState<Design | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [objectCount, setObjectCount] = useState(0);
  const [backgroundType, setBackgroundType] = useState<'transparent' | 'white'>('transparent');
  const canvasRef = useRef<CanvasEditorRef>(null);

  useEffect(() => {
    loadOrderData();
    loadTemplates();
  }, [orderId]);

  useEffect(() => {
    if (currentDesign?.canvas_data && canvasRef.current) {
      canvasRef.current.loadCanvasData(currentDesign.canvas_data);
    }
  }, [currentDesign]);

  const loadOrderData = async () => {
    try {
      const orderData = await ordersAPI.getById(Number(orderId));
      setOrder(orderData);
      const designsData = await designsAPI.getByOrderId(Number(orderId));
      if (designsData.length > 0) {
        setCurrentDesign(designsData[0]);
      }
    } catch (error) {
      console.error('加载订单数据失败:', error);
      alert('加载订单数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const templatesData = await templatesAPI.getAll();
      // 处理可能的分页响应或直接数组响应
      if (Array.isArray(templatesData)) {
        setTemplates(templatesData);
      } else {
        setTemplates(templatesData.data || []);
      }
    } catch (error) {
      console.error('加载模板失败:', error);
    }
  };

  const handleTemplateSelect = (template: Template) => {
    if (canvasRef.current) {
      const url = `http://localhost:3001${template.image_path}`;
      canvasRef.current.addTemplateImage(url);
    }
  };

  // 处理编辑模式变化
  const handleEditModeChange = (mode: string | null, target: any) => {
    console.log('编辑模式变化:', mode, target);
  };

  const handleUploadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && canvasRef.current) {
      // 如果有选中的相框，上传到相框；否则作为普通图片添加
      if (selectedObject && (selectedObject as any)._frameType) {
        canvasRef.current.uploadImageToFrame(file);
      } else {
        canvasRef.current.addImage(URL.createObjectURL(file));
      }
    }
  };



  const handleSaveDesign = async () => {
    if (!canvasRef.current || !order) return;

    setSaving(true);
    try {
      const canvasData = canvasRef.current.getCanvasData();
      const previewDataUrl = canvasRef.current.exportCanvas(backgroundType);
      
      // 将data URL转换为blob的更可靠方法
      const dataUrlToBlob = (dataUrl: string): Blob => {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
      };

      const blob = dataUrlToBlob(previewDataUrl);
      const file = new File([blob], 'preview.png', { type: 'image/png' });

      const designData = {
        order_id: order.id,
        name: currentDesign?.name || '主设计',
        canvas_data: canvasData,
        width: 708,  // 75cm at 72 DPI
        height: 945, // 100cm at 72 DPI
        background_type: backgroundType
      };

      if (currentDesign) {
        const updated = await designsAPI.updateWithPreview(currentDesign.id, designData, file);
        setCurrentDesign(updated);
        alert(`设计保存成功！(${backgroundType === 'transparent' ? '透明背景' : '白色背景'})`);
      } else {
        const newDesign = await designsAPI.createWithPreview(designData, file);
        setCurrentDesign(newDesign);
        alert(`设计创建成功！(${backgroundType === 'transparent' ? '透明背景' : '白色背景'})`);
      }

      // 自动将订单标记更新为"待确认"
      if (order.mark !== 'pending_confirm') {
        try {
          const updatedOrder = await ordersAPI.update(order.id, {
            ...order,
            mark: 'pending_confirm'
          });
          setOrder(updatedOrder);
        } catch (error) {
          console.error('更新订单标记失败:', error);
          // 不影响设计保存的成功提示，只在控制台记录错误
        }
      }

      // 保存成功后自动跳转回订单列表主页
      setTimeout(() => {
        navigate('/');
      }, 1500); // 延迟1.5秒让用户看到成功提示
    } catch (error) {
      console.error('保存设计失败:', error);
      console.error('错误详情:', error);
      alert(`保存设计失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportOrder = async () => {
    if (!order) return;
    try {
      uploadAPI.exportOrder(order.id);
    } catch (error) {
      console.error('导出订单失败:', error);
      alert('导出订单失败');
    }
  };

  const handleDownloadImage = (backgroundType: 'white' | 'transparent') => {
    if (!canvasRef.current) return;
    
    try {
      // 导出高分辨率原画质图片
      const dataUrl = canvasRef.current.exportCanvas(backgroundType, true);
      
      // 创建下载链接
      const link = document.createElement('a');
      link.download = `design-${backgroundType}-${Date.now()}.png`;
      link.href = dataUrl;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`下载${backgroundType === 'transparent' ? '透明背景' : '白色背景'}图片成功`);
    } catch (error) {
      console.error('下载图片失败:', error);
      alert('下载图片失败');
    }
  };

  const handleSelectionChange = (object: any) => {
    setSelectedObject(object);
  };

  const handleObjectCountChange = (count: number) => {
    setObjectCount(count);
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  if (!order) {
    return <div className="text-center py-8 text-red-500">订单不存在</div>;
  }

  return (
    <Layout title={`设计订单 - ${order.order_number}`} showBack={true}>
      <div className="flex flex-col lg:flex-row gap-6 h-full">
        {/* 左侧工具栏 */}
        <div className="lg:w-80 bg-white rounded-lg shadow p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">订单信息</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>客户: {order.customer_name}</p>
              <p>尺寸: {order.product_size}</p>
              <p>电话: {order.phone}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">上传图片</h3>
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadImage}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">相框工具</h3>
            <div className="space-y-2">
              <button
                onClick={() => canvasRef.current?.addCircleFrame(226, 260, 85)}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                ➕ 添加圆形相框
              </button>
              <p className="text-xs text-gray-500 mt-1">
                💡 双击空相框上传照片，双击已有照片调整位置
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">画布操作</h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (window.confirm('确定要清空画布吗？此操作不可撤销。')) {
                    canvasRef.current?.clearCanvas();
                  }
                }}
                className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                🗑️ 清空画布
              </button>
              <p className="text-xs text-gray-500 mt-1">
                ⚠️ 清空画布将删除所有元素，请谨慎操作
              </p>
            </div>
          </div>

          <CanvasTemplateLibrary
            onTemplateSelect={handleTemplateSelect}
          />

          {objectCount >= 2 && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-2">图层操作</h3>
              {selectedObject && (
                <div className="text-sm text-gray-600 mb-2">
                  <p>当前选中: {selectedObject.type === 'image' ? '图片' : selectedObject.type === 'text' ? '文字' : '形状'}</p>
                </div>
              )}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => canvasRef.current?.bringForward()} 
                    disabled={!selectedObject}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 rounded text-sm"
                  >
                    上移一层
                  </button>
                  <button 
                    onClick={() => canvasRef.current?.sendBackwards()} 
                    disabled={!selectedObject}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 rounded text-sm"
                  >
                    下移一层
                  </button>
                  <button 
                    onClick={() => canvasRef.current?.bringToFront()} 
                    disabled={!selectedObject}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 rounded text-sm"
                  >
                    置顶
                  </button>
                  <button 
                    onClick={() => canvasRef.current?.sendToBack()} 
                    disabled={!selectedObject}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 rounded text-sm"
                  >
                    置底
                  </button>
                </div>
                {!selectedObject && (
                  <p className="text-xs text-gray-500 mt-2">
                    💡 请先选中一个对象来进行图层操作
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 背景类型选择 */}
          <div className="border rounded-lg p-3 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">保存背景</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="backgroundType"
                    value="white"
                    checked={backgroundType === 'white'}
                    onChange={(e) => setBackgroundType(e.target.value as 'white' | 'transparent')}
                    className="mr-2"
                  />
                  <span className="text-sm">白色背景</span>
                </label>
                <button
                  onClick={() => handleDownloadImage('white')}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                >
                  下载
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="backgroundType"
                    value="transparent"
                    checked={backgroundType === 'transparent'}
                    onChange={(e) => setBackgroundType(e.target.value as 'white' | 'transparent')}
                    className="mr-2"
                  />
                  <span className="text-sm">透明背景</span>
                </label>
                <button
                  onClick={() => handleDownloadImage('transparent')}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                >
                  下载
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 选择保存时的背景类型，点击下载按钮可导出原画质图片
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSaveDesign}
              disabled={saving}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >{saving ? '保存中...' : '保存设计'}</button>
            <button
              onClick={handleExportOrder}
              className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
            >导出订单</button>
          </div>
        </div>

        {/* 右侧画布 */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            <CanvasEditor 
              ref={canvasRef} 
              onSelectionChange={handleSelectionChange}
              onEditModeChange={handleEditModeChange}
              onObjectCountChange={handleObjectCountChange}
            />
          </div>
      </div>
    </Layout>
  );
};

export default DesignEditor;