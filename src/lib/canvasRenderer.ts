import { fabric } from 'fabric';

// 画布配置常量（与CanvasEditor保持一致）
const CANVAS_CONFIG = {
  PHYSICAL_WIDTH_CM: 75,
  PHYSICAL_HEIGHT_CM: 100,
  ASPECT_RATIO: 75 / 100,
  BASE_DISPLAY_WIDTH_PX: 1062,
  BASE_DISPLAY_HEIGHT_PX: 1418,
  PRINT_WIDTH_PX: 2953,
  PRINT_HEIGHT_PX: 3937,
  DISPLAY_DPI: 72,
  PRINT_DPI: 300,
};

/**
 * 从canvas_data生成高分辨率图片
 * @param canvasData 画布数据JSON字符串
 * @param backgroundType 背景类型
 * @param highResolution 是否生成高分辨率图片
 * @returns Promise<string> Base64格式的图片数据
 */
export async function renderCanvasToHighResImage(
  canvasData: string,
  backgroundType: 'white' | 'transparent' = 'white',
  highResolution: boolean = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // 创建临时canvas元素
      const tempCanvas = document.createElement('canvas');
      const displayWidth = CANVAS_CONFIG.BASE_DISPLAY_WIDTH_PX;
      const displayHeight = CANVAS_CONFIG.BASE_DISPLAY_HEIGHT_PX;
      
      tempCanvas.width = displayWidth;
      tempCanvas.height = displayHeight;
      
      // 创建fabric canvas实例 - 初始背景色设为白色，后续根据需要调整
      const fabricCanvas = new fabric.Canvas(tempCanvas, {
        width: displayWidth,
        height: displayHeight,
        backgroundColor: '#ffffff', // 先设为白色，与 CanvasEditor 保持一致
        preserveObjectStacking: true,
      });

      // 加载canvas数据
      fabricCanvas.loadFromJSON(canvasData, () => {
        try {
          // 在导出前，对画布内容进行缩放和居中处理，使其占满画布的90%
          const scaleAndCenterContent = () => {
            const objects = fabricCanvas.getObjects();
            if (objects.length === 0) return;

            // 直接计算所有对象的边界框，避免使用临时组破坏clipPath关系
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            objects.forEach(obj => {
              const boundingRect = obj.getBoundingRect();
              minX = Math.min(minX, boundingRect.left);
              minY = Math.min(minY, boundingRect.top);
              maxX = Math.max(maxX, boundingRect.left + boundingRect.width);
              maxY = Math.max(maxY, boundingRect.top + boundingRect.height);
            });

            const boundingRect = {
              left: minX,
              top: minY,
              width: maxX - minX,
              height: maxY - minY
            };

            // 计算缩放比例，使内容占满画布的90%
            const targetScale = 0.90;
            const scaleX = (displayWidth * targetScale) / boundingRect.width;
            const scaleY = (displayHeight * targetScale) / boundingRect.height;
            const scale = Math.min(scaleX, scaleY); // 保持宽高比

            // 计算居中位置
            const scaledWidth = boundingRect.width * scale;
            const scaledHeight = boundingRect.height * scale;
            const centerX = displayWidth / 2;
            const centerY = displayHeight / 2;
            const offsetX = centerX - (boundingRect.left + boundingRect.width / 2) * scale;
            const offsetY = centerY - (boundingRect.top + boundingRect.height / 2) * scale;

            // 应用缩放和位移到所有对象，同时保持clipPath关系
            objects.forEach(obj => {
              // 缩放对象
              obj.scaleX = (obj.scaleX || 1) * scale;
              obj.scaleY = (obj.scaleY || 1) * scale;
              
              // 调整位置
              obj.left = (obj.left || 0) * scale + offsetX;
              obj.top = (obj.top || 0) * scale + offsetY;
              
              // 如果对象有clipPath，也需要同步缩放和位移clipPath
              if (obj.clipPath) {
                const clipPath = obj.clipPath as fabric.Object;
                clipPath.scaleX = (clipPath.scaleX || 1) * scale;
                clipPath.scaleY = (clipPath.scaleY || 1) * scale;
                clipPath.left = (clipPath.left || 0) * scale + offsetX;
                clipPath.top = (clipPath.top || 0) * scale + offsetY;
                clipPath.setCoords();
              }
              
              // 设置坐标
              obj.setCoords();
            });

            fabricCanvas.renderAll();
          };

          // 执行缩放和居中
          scaleAndCenterContent();

          // 如果是透明背景，需要特殊处理（与 CanvasEditor.exportCanvas 保持一致）
          if (backgroundType === 'transparent') {
            // 临时保存原始背景色
            const originalBackgroundColor = fabricCanvas.backgroundColor;
            
            // 设置透明背景
            fabricCanvas.setBackgroundColor('transparent', () => {
              fabricCanvas.renderAll();
            });
            
            // 设置导出参数
            const exportOptions: any = {
              format: 'png',
              quality: 1,
            };
            
            // 如果是高分辨率导出，设置更高的倍数
            if (highResolution) {
              exportOptions.multiplier = CANVAS_CONFIG.PRINT_DPI / CANVAS_CONFIG.DISPLAY_DPI; // 300/72 ≈ 4.17倍
            }
            
            // 导出透明背景图片
            const dataUrl = fabricCanvas.toDataURL(exportOptions);
            
            // 恢复原始背景色
            fabricCanvas.setBackgroundColor(originalBackgroundColor, () => {
              fabricCanvas.renderAll();
            });
            
            // 清理资源
            fabricCanvas.dispose();
            
            resolve(dataUrl);
          } else {
            // 白色背景的正常导出
            const exportOptions: any = {
              format: 'png',
              quality: 1,
              backgroundColor: '#ffffff',
            };
            
            // 如果是高分辨率导出，设置更高的倍数
            if (highResolution) {
              exportOptions.multiplier = CANVAS_CONFIG.PRINT_DPI / CANVAS_CONFIG.DISPLAY_DPI; // 300/72 ≈ 4.17倍
            }
            
            // 导出为dataURL
            const dataUrl = fabricCanvas.toDataURL(exportOptions);
            
            // 清理资源
            fabricCanvas.dispose();
            
            resolve(dataUrl);
          }
        } catch (error) {
          console.warn('[CanvasRenderer] Canvas导出失败，可能是由于CORS污染:', error);
          
          // 备用方案：创建一个新的Canvas，重新绘制所有对象（与 CanvasEditor 保持一致）
          try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = fabricCanvas.width || 800;
            tempCanvas.height = fabricCanvas.height || 600;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (!tempCtx) {
              throw new Error('无法创建临时Canvas上下文');
            }
            
            // 根据背景类型设置背景
            if (backgroundType === 'white') {
              tempCtx.fillStyle = '#ffffff';
              tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            }
            // 透明背景不需要填充背景色
            
            // 绘制提示信息
            tempCtx.fillStyle = backgroundType === 'transparent' ? '#333333' : '#666666';
            tempCtx.font = '16px Arial';
            tempCtx.textAlign = 'center';
            tempCtx.fillText('设计预览', tempCanvas.width / 2, tempCanvas.height / 2 - 20);
            tempCtx.fillText('(包含外部图片，无法完整导出)', tempCanvas.width / 2, tempCanvas.height / 2 + 20);
            
            fabricCanvas.dispose();
            resolve(tempCanvas.toDataURL('image/png'));
          } catch (fallbackError) {
            console.error('[CanvasRenderer] 备用导出方案也失败:', fallbackError);
            
            // 最后的备用方案：返回一个简单的占位图
            const placeholderCanvas = document.createElement('canvas');
            placeholderCanvas.width = 400;
            placeholderCanvas.height = 300;
            const placeholderCtx = placeholderCanvas.getContext('2d');
            
            if (placeholderCtx) {
              // 根据背景类型设置占位图背景
              if (backgroundType === 'white') {
                placeholderCtx.fillStyle = '#f0f0f0';
                placeholderCtx.fillRect(0, 0, 400, 300);
              }
              
              placeholderCtx.fillStyle = backgroundType === 'transparent' ? '#333333' : '#999999';
              placeholderCtx.font = '14px Arial';
              placeholderCtx.textAlign = 'center';
              placeholderCtx.fillText('无法导出设计预览', 200, 150);
              
              fabricCanvas.dispose();
              resolve(placeholderCanvas.toDataURL('image/png'));
            } else {
              fabricCanvas.dispose();
              reject(new Error('无法创建占位图'));
            }
          }
        }
      });

    } catch (error) {
      console.error('Canvas渲染失败:', error);
      reject(error);
    }
  });
}

/**
 * 将dataURL转换为Blob
 * @param dataUrl Base64格式的图片数据
 * @returns Blob对象
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * 从Blob推断文件扩展名
 * @param blob Blob对象
 * @returns 文件扩展名
 */
export function getBlobExtension(blob: Blob): string {
  const mimeType = blob.type;
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}