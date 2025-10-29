/**
 * 图片压缩和Base64转换工具函数
 */

/**
 * 检测图片是否有透明背景
 */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // 检查alpha通道
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
}

/**
 * 压缩图片并转换为Base64格式，用于HTML缩略图
 * @param imageUrl 图片URL（支持data:image/...格式和网络URL）
 * @param maxSize 最大边长，默认200px
 * @param quality JPEG质量，默认0.8
 * @returns Promise<string> Base64格式的图片数据
 */
export async function compressImageForHTML(
  imageUrl: string, 
  maxSize: number = 200, 
  quality: number = 0.8
): Promise<string> {
  try {
    let blob: Blob;
    
    // 处理不同类型的图片URL
    if (imageUrl.startsWith('data:image/')) {
      // Base64格式
      const response = await fetch(imageUrl);
      blob = await response.blob();
    } else {
      // 网络URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      blob = await response.blob();
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('无法创建canvas上下文'));
            return;
          }
          
          // 计算缩放比例
          const scale = Math.min(maxSize / img.width, maxSize / img.height);
          const newWidth = Math.floor(img.width * scale);
          const newHeight = Math.floor(img.height * scale);
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // 绘制图片
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          // 检测透明度并选择格式
          const hasAlpha = hasTransparency(canvas);
          const format = hasAlpha ? 'image/png' : 'image/jpeg';
          const outputQuality = hasAlpha ? undefined : quality;
          
          // 转换为Base64
          const base64 = canvas.toDataURL(format, outputQuality);
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };
      
      img.src = URL.createObjectURL(blob);
    });
  } catch (error) {
    console.error('图片压缩失败:', error);
    // 回退到原始URL
    return imageUrl;
  }
}

/**
 * 从Blob类型推断文件扩展名
 */
export function getExtensionFromBlob(blob: Blob): string {
  const mimeType = blob.type.toLowerCase();
  
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('svg')) return 'svg';
  if (mimeType.includes('bmp')) return 'bmp';
  
  // 默认返回jpg
  return 'jpg';
}

/**
 * 获取图片的原始Blob数据
 * @param imageUrl 图片URL
 * @returns Promise<Blob> 图片的Blob数据
 */
export async function getImageBlob(imageUrl: string): Promise<Blob> {
  if (imageUrl.startsWith('data:image/')) {
    // Base64格式
    const response = await fetch(imageUrl);
    return await response.blob();
  } else {
    // 网络URL
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    return await response.blob();
  }
}

/**
 * 清理文件名中的非法字符
 * @param filename 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFilename(filename: string): string {
  // 替换Windows和其他系统中的非法字符
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')  // 替换非法字符为下划线
    .replace(/\s+/g, '_')          // 替换空格为下划线
    .replace(/_{2,}/g, '_')        // 合并多个下划线
    .replace(/^_+|_+$/g, '')       // 移除开头和结尾的下划线
    .substring(0, 100);            // 限制长度
}