import clsx, { type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化时间显示
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  // 如果是今天
  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMinutes === 0) {
        return '刚刚';
      }
      return `${diffMinutes}分钟前`;
    }
    return `${diffHours}小时前`;
  }
  
  // 如果是昨天
  if (diffDays === 1) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // 如果是一周内
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }
  
  // 超过一周，显示具体日期
  return date.toLocaleDateString('zh-CN', { 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 格式化相对时间（简短版本）
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMinutes === 0) {
        return '刚刚';
      }
      return `${diffMinutes}分钟前`;
    }
    return `${diffHours}小时前`;
  }
  
  if (diffDays < 30) {
    return `${diffDays}天前`;
  }
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}个月前`;
  }
  
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}年前`;
}

// 格式化为年月日时分格式
export function formatYMDHM(dateString: string): string {
  // 检查输入是否有效
  if (!dateString || dateString === 'null' || dateString === 'undefined') {
    return '暂无时间';
  }
  
  // 如果是数据库格式的时间字符串（YYYY-MM-DD HH:MM:SS），直接解析
  if (dateString.includes(' ') && dateString.length === 19) {
    const [datePart, timePart] = dateString.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');
    return `${year}年${month}月${day}日${hours}:${minutes}`;
  }
  
  const date = new Date(dateString);
  
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return '时间格式错误';
  }
  
  // 数据库存储的已经是东八区时间，直接格式化
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}年${month}月${day}日${hours}:${minutes}`;
}

// 构建图片URL
export function buildImageUrl(imagePath: string): string {
  if (!imagePath) return '';
  
  // 如果已经是完整URL，直接返回
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // 确保路径以/开头
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;

  // 获取配置的 API Base URL
  // 开发环境通常是 http://localhost:3001/api
  // 生产环境可能是 /api 或空字符串
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001/api');
  
  // 计算 Origin (去除末尾的 /api)
  // http://localhost:3001/api -> http://localhost:3001
  const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, '');

  let normalizedPath = path;

  // 在生产环境将本地静态路径映射到可访问的API文件路径
  if (import.meta.env.PROD) {
    if (path.startsWith('/uploads/templates/')) {
      const filename = path.split('/').pop() || '';
      normalizedPath = `/api/files/templates/${filename}`;
    } else if (path.startsWith('/uploads/images/')) {
      const filename = path.split('/').pop() || '';
      normalizedPath = `/api/files/images/${filename}`;
    } else if (path.startsWith('/uploads/designs/')) {
      const filename = path.split('/').pop() || '';
      normalizedPath = `/api/files/designs/${filename}`;
    }
  }

  // 如果路径已经是 /api 开头，而 apiBaseUrl 也包含 /api，则使用 apiOrigin 避免重复
  if (normalizedPath.startsWith('/api/') && apiBaseUrl.endsWith('/api')) {
    return `${apiOrigin}${normalizedPath}`;
  }
  
  // 如果路径是 /uploads 开头（开发环境静态文件），应该直接挂载在 Origin 下
  if (normalizedPath.startsWith('/uploads/')) {
    return `${apiOrigin}${normalizedPath}`;
  }

  // 其他情况直接拼接
  return `${apiBaseUrl}${normalizedPath}`;
}

// 构建缩略图URL
export function buildThumbnailUrl(imagePath: string, size: 'thumb' | 'medium' = 'thumb'): string {
  const fullUrl = buildImageUrl(imagePath);
  // Insert prefix before filename
  const parts = fullUrl.split('/');
  const filename = parts.pop();
  if (!filename) return fullUrl;
  return parts.join('/') + '/' + size + '_' + filename;
}
