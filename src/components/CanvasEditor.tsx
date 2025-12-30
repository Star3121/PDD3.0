import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { fabric } from 'fabric';

// 画布尺寸常量 - 75*100cm 抱枕尺寸
const CANVAS_CONFIG = {
  // 物理尺寸（厘米）
  PHYSICAL_WIDTH_CM: 75,
  PHYSICAL_HEIGHT_CM: 100,
  // 宽高比例 (75:100 = 0.75)
  ASPECT_RATIO: 75 / 100,
  // 基础显示尺寸（像素，72 DPI）- 增大1.5倍以获得更好的视觉效果
  BASE_DISPLAY_WIDTH_PX: 1062,  // 75cm at 72 DPI * 1.5
  BASE_DISPLAY_HEIGHT_PX: 1418, // 100cm at 72 DPI * 1.5
  // 打印尺寸（像素，300 DPI）
  PRINT_WIDTH_PX: 2953,   // 75cm at 300 DPI
  PRINT_HEIGHT_PX: 3937,  // 100cm at 300 DPI
  // DPI 设置
  DISPLAY_DPI: 72,
  PRINT_DPI: 300,
  // 响应式设置
  MIN_CANVAS_WIDTH: 450,   // 最小画布宽度（增大以适应新的基础尺寸）
  MIN_CANVAS_HEIGHT: 600,  // 最小画布高度（增大以适应新的基础尺寸）
  CONTAINER_PADDING: 40,   // 容器内边距
};

// 编辑模式类型
type EditMode = 'frame' | 'image' | null;

// 编辑动作接口
interface EditAction {
  type: 'transform' | 'move' | 'scale' | 'rotate';
  target: fabric.Object;
  previousState: any;
  currentState: any;
}

// 编辑状态接口
interface FrameEditorState {
  mode: EditMode;
  selectedFrame: fabric.Object | null;
  selectedImage: fabric.Image | null;
  isDragging: boolean;
}

// 命令接口
interface Command {
  execute(): void;
  undo(): void;
}

// 相框变换命令
class FrameTransformCommand implements Command {
  constructor(
    private frame: fabric.Object,
    private previousState: any,
    private currentState: any
  ) {}

  execute() {
    this.frame.set(this.currentState);
    this.frame.canvas?.renderAll();
  }

  undo() {
    this.frame.set(this.previousState);
    this.frame.canvas?.renderAll();
  }
}

// 图片变换命令
class ImageTransformCommand implements Command {
  constructor(
    private image: fabric.Image,
    private previousState: any,
    private currentState: any
  ) {}

  execute() {
    this.image.set(this.currentState);
    this.image.canvas?.renderAll();
  }

  undo() {
    this.image.set(this.previousState);
    this.image.canvas?.renderAll();
  }
}

// 历史管理器
class HistoryManager {
  private history: any[] = [];
  private currentIndex = -1;
  private maxSize = 50;

  push(state: any) {
    // 如果不在历史末尾，删除后面的记录
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // 添加新状态
    this.history.push(state);
    this.currentIndex++;

    // 如果超过最大大小，删除最旧的记录
    if (this.history.length > this.maxSize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  undo(): any | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  redo(): any | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }
}

// CanvasEditor 属性接口
export interface CanvasEditorProps {
  width?: number;
  height?: number;
  onSelectionChange?: (object: fabric.Object | null) => void;
  onEditModeChange?: (mode: EditMode, target: fabric.Object | null) => void;
  onObjectCountChange?: (count: number) => void;
  onChange?: () => void;
}

// CanvasEditor 引用接口
export interface CanvasEditorRef {
  addImage: (url: string, options?: fabric.IImageOptions) => void;
  exportCanvas: (backgroundType?: 'transparent' | 'white', highResolution?: boolean, maxWidth?: number) => string;
  addCircleFrame: (x: number, y: number, radius: number) => void;
  uploadImageToFrame: (file: File) => void;
  getCanvasData: () => string;
  loadCanvasData: (data: string) => void;
  bringForward: () => void;
  sendBackwards: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  enableLowResolutionMode: () => void;
  disableLowResolutionMode: () => void;
  getPerformanceInfo: () => { fps: number; isLowResolution: boolean };
  addTemplateImage: (url: string) => void;
  clearCanvas: () => void;
}

const CanvasEditor = forwardRef<CanvasEditorRef, CanvasEditorProps>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasInstance = useRef<fabric.Canvas | null>(null);
  const historyManagerRef = useRef(new HistoryManager());
  
  const [editState, setEditState] = useState<FrameEditorState>({
    mode: null,
    selectedFrame: null,
    selectedImage: null,
    isDragging: false,
  });

  // 使用ref持有最新的编辑状态，解决事件回调中的闭包问题
  const editStateRef = useRef(editState);
  useEffect(() => {
    editStateRef.current = editState;
  }, [editState]);

  // 工具函数：计算响应式画布尺寸
  const calculateResponsiveCanvasSize = () => {
    // 获取容器可用空间（考虑侧边栏和内边距）
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 预留空间：侧边栏(320px) + 内边距 + 工具栏等
    const availableWidth = Math.max(viewportWidth - 400, CANVAS_CONFIG.MIN_CANVAS_WIDTH);
    const availableHeight = Math.max(viewportHeight - 200, CANVAS_CONFIG.MIN_CANVAS_HEIGHT);
    
    // 根据75:100的宽高比计算最佳尺寸
    const aspectRatio = CANVAS_CONFIG.ASPECT_RATIO;
    
    // 按宽度计算高度
    let canvasWidth = availableWidth - CANVAS_CONFIG.CONTAINER_PADDING;
    let canvasHeight = canvasWidth / aspectRatio;
    
    // 如果高度超出可用空间，则按高度计算宽度
    if (canvasHeight > availableHeight - CANVAS_CONFIG.CONTAINER_PADDING) {
      canvasHeight = availableHeight - CANVAS_CONFIG.CONTAINER_PADDING;
      canvasWidth = canvasHeight * aspectRatio;
    }
    
    // 确保不小于最小尺寸
    canvasWidth = Math.max(canvasWidth, CANVAS_CONFIG.MIN_CANVAS_WIDTH);
    canvasHeight = Math.max(canvasHeight, CANVAS_CONFIG.MIN_CANVAS_HEIGHT);
    
    return {
      width: Math.round(canvasWidth),
      height: Math.round(canvasHeight),
      scale: canvasWidth / CANVAS_CONFIG.BASE_DISPLAY_WIDTH_PX
    };
  };

  // 工具函数：计算图片适配画布的尺寸和位置
  const calculateImageFitToCanvas = (imageWidth: number, imageHeight: number) => {
    const canvasWidth = responsiveSize.width;
    const canvasHeight = responsiveSize.height;
    
    // 设置图片的最大显示尺寸为画布的90%，让图片在画布上显示得更大一些
    const maxDisplayWidth = canvasWidth * 0.9;
    const maxDisplayHeight = canvasHeight * 0.9;
    
    // 计算缩放比例，确保图片在合理范围内
    const scaleX = maxDisplayWidth / imageWidth;
    const scaleY = maxDisplayHeight / imageHeight;
    const scale = Math.min(scaleX, scaleY, 1); // 不放大，只缩小
    
    // 计算居中位置
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const left = (canvasWidth - scaledWidth) / 2;
    const top = (canvasHeight - scaledHeight) / 2;
    
    return {
      scale,
      left,
      top,
      width: scaledWidth,
      height: scaledHeight
    };
  };

  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    targetObject: fabric.Object | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    targetObject: null
  });
  const [responsiveSize, setResponsiveSize] = useState(() => {
    // 初始化时计算响应式尺寸
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const availableWidth = Math.max(viewportWidth - 400, CANVAS_CONFIG.MIN_CANVAS_WIDTH);
    const availableHeight = Math.max(viewportHeight - 200, CANVAS_CONFIG.MIN_CANVAS_HEIGHT);
    const aspectRatio = CANVAS_CONFIG.ASPECT_RATIO;
    
    let canvasWidth = availableWidth - CANVAS_CONFIG.CONTAINER_PADDING;
    let canvasHeight = canvasWidth / aspectRatio;
    
    if (canvasHeight > availableHeight - CANVAS_CONFIG.CONTAINER_PADDING) {
      canvasHeight = availableHeight - CANVAS_CONFIG.CONTAINER_PADDING;
      canvasWidth = canvasHeight * aspectRatio;
    }
    
    canvasWidth = Math.max(canvasWidth, CANVAS_CONFIG.MIN_CANVAS_WIDTH);
    canvasHeight = Math.max(canvasHeight, CANVAS_CONFIG.MIN_CANVAS_HEIGHT);
    
    return {
      width: Math.round(canvasWidth),
      height: Math.round(canvasHeight),
      scale: canvasWidth / CANVAS_CONFIG.BASE_DISPLAY_WIDTH_PX
    };
  });

  // 初始化画布
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
        width: responsiveSize.width,
        height: responsiveSize.height,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
    });

    canvasInstance.current = canvas;

    // 设置画布事件
    setupCanvasEvents();

    // 添加键盘事件监听
    const handleKeyDown = (e: KeyboardEvent) => {
      // 防止在输入框等元素中触发
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            undo();
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // 保存初始状态到历史
    saveStateToHistory();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      
      // 安全地清理Canvas
      try {
        if (canvas && typeof canvas.dispose === 'function') {
          // 先清理事件监听器
          cleanupCanvas();
          
          // 清理Canvas上下文
          const canvasElement = canvas.getElement();
          if (canvasElement) {
            const ctx = canvasElement.getContext('2d');
            if (ctx && typeof ctx.clearRect === 'function') {
              try {
                ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
              } catch (error) {
                console.warn('[CanvasEditor] Canvas context clearRect failed:', error);
              }
            }
          }
          
          // 最后dispose Canvas
          canvas.dispose();
        }
      } catch (error) {
        console.warn('[CanvasEditor] Canvas cleanup failed:', error);
      }
    };
  }, [responsiveSize]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      const newSize = calculateResponsiveCanvasSize();
      setResponsiveSize(newSize);
      
      // 更新画布尺寸
      if (canvasInstance.current) {
        canvasInstance.current.setDimensions({
          width: newSize.width,
          height: newSize.height
        });
        canvasInstance.current.renderAll();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 设置画布事件
  const setupCanvasEvents = () => {
    if (!canvasInstance.current) return;

    const canvas = canvasInstance.current;

    // 选择事件
    canvas.on('selection:created', handleSelectionCreated);
    canvas.on('selection:updated', handleSelectionUpdated);
    canvas.on('selection:cleared', handleSelectionCleared);

    // 鼠标事件
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    
    // 双击事件 - 核心功能
    canvas.on('mouse:dblclick', handleDoubleClick);
    
    // 右键菜单事件
    canvas.on('mouse:down:before', (e) => {
      // 如果是右键点击，显示右键菜单
      if (e.e.button === 2) {
        handleContextMenu(e);
      }
    });

    // 对象变换事件
  canvas.on('object:modified', throttle(handleObjectModified, 100));
  canvas.on('object:scaling', throttle(handleObjectScaling, 50));
  canvas.on('object:moving', throttle(handleObjectMoving, 50));
  canvas.on('object:rotating', throttle(handleObjectRotating, 50));
  };

  // 清理画布事件
  const cleanupCanvas = () => {
    if (!canvasInstance.current) return;

    const canvas = canvasInstance.current;

    canvas.off('selection:created', handleSelectionCreated);
    canvas.off('selection:updated', handleSelectionUpdated);
    canvas.off('selection:cleared', handleSelectionCleared);
    canvas.off('mouse:down', handleMouseDown);
    canvas.off('mouse:move', handleMouseMove);
    canvas.off('mouse:up', handleMouseUp);
    canvas.off('mouse:dblclick', handleDoubleClick);
    canvas.off('mouse:down:before');
    canvas.off('object:modified', handleObjectModified);
    canvas.off('object:scaling', handleObjectScaling);
    canvas.off('object:moving', handleObjectMoving);
    canvas.off('object:rotating', handleObjectRotating);
  };

  // 输入验证函数
  const validateObject = (obj: any, operation: string): boolean => {
    if (!obj) {
      console.warn(`[CanvasEditor] Invalid object for ${operation}`);
      return false;
    }
    if (!canvasInstance.current) {
      console.warn(`[CanvasEditor] Canvas not initialized for ${operation}`);
      return false;
    }
    return true;
  };

  const validateCanvas = (operation: string): boolean => {
    if (!canvasInstance.current) {
      console.warn(`[CanvasEditor] Canvas not initialized for ${operation}`);
      return false;
    }
    return true;
  };

  // 边界检查函数
  const clampValue = (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
  };

  // 通知对象数量变化
  const notifyObjectCountChange = () => {
    if (!canvasInstance.current) return;
    const objectCount = canvasInstance.current.getObjects().length;
    props.onObjectCountChange?.(objectCount);
  };

  // 性能优化相关
  const renderQueue = useRef<(() => void)[]>([]);
  const isRendering = useRef(false);
  const lastRenderTime = useRef(0);
  const RENDER_THROTTLE = 16; // 约60fps

  // 防抖函数
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // 节流函数
  const throttle = (func: Function, limit: number) => {
    let inThrottle: boolean;
    return function executedFunction(...args: any[]) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  // 批量渲染
  const batchRender = () => {
    if (!canvasInstance.current) return;

    const now = Date.now();
    if (now - lastRenderTime.current < RENDER_THROTTLE) {
      // 如果距离上次渲染时间太短，加入队列
      if (!isRendering.current) {
        requestAnimationFrame(() => {
          executeRenderQueue();
        });
      }
      return;
    }

    // 直接渲染
    executeRender();
  };

  // 执行渲染队列
  const executeRenderQueue = () => {
    if (!canvasInstance.current || renderQueue.current.length === 0) {
      isRendering.current = false;
      return;
    }

    isRendering.current = true;
    
    // 执行所有队列中的操作
    const operations = [...renderQueue.current];
    renderQueue.current = [];
    
    operations.forEach(op => op());
    
    // 渲染画布
    canvasInstance.current!.renderAll();
    lastRenderTime.current = Date.now();
    isRendering.current = false;
  };

  // 直接执行渲染
  const executeRender = () => {
    if (!canvasInstance.current) return;
    
    canvasInstance.current.renderAll();
    lastRenderTime.current = Date.now();
    
    // 更新性能监控
    performanceMonitor.update();
  };

  // 低分辨率预览模式
  const enableLowResolutionMode = () => {
    if (!canvasInstance.current) return;
    
    const canvas = canvasInstance.current;
    const originalWidth = canvas.width!;
    const originalHeight = canvas.height!;
    
    // 降低分辨率到50%
    canvas.setWidth(originalWidth * 0.5);
    canvas.setHeight(originalHeight * 0.5);
    canvas.setZoom(0.5);
    
    // 降低图片质量以提高性能
    canvas.getObjects().forEach(obj => {
      if (obj.type === 'image') {
        (obj as any).filters = [(obj as any).filters[0]]; // 只保留第一个滤镜
      }
    });
    
    canvas.renderAll();
  };

  // 恢复高分辨率模式
  const disableLowResolutionMode = () => {
    if (!canvasInstance.current) return;
    
    const canvas = canvasInstance.current;
    const originalWidth = canvas.width! * 2;
    const originalHeight = canvas.height! * 2;
    
    canvas.setWidth(originalWidth);
    canvas.setHeight(originalHeight);
    canvas.setZoom(1);
    
    // 恢复图片质量
    canvas.getObjects().forEach(obj => {
      if (obj.type === 'image') {
        // 恢复所有滤镜
        const img = obj as any;
        if (img._originalFilters) {
          img.filters = img._originalFilters;
        }
      }
    });
    
    canvas.renderAll();
  };

  // 性能监控
  const performanceMonitor = {
    frameCount: 0,
    lastFpsTime: Date.now(),
    currentFps: 60,
    lowPerformanceThreshold: 30, // FPS低于30时启用低分辨率模式
    
    update() {
      this.frameCount++;
      const now = Date.now();
      const deltaTime = now - this.lastFpsTime;
      
      if (deltaTime >= 1000) { // 每秒计算一次FPS
        this.currentFps = Math.round((this.frameCount * 1000) / deltaTime);
        this.frameCount = 0;
        this.lastFpsTime = now;
        
        // 根据性能调整渲染质量
        if (this.currentFps < this.lowPerformanceThreshold) {
          enableLowResolutionMode();
        } else if (this.currentFps > this.lowPerformanceThreshold + 10) {
          disableLowResolutionMode();
        }
      }
    },
    
    reset() {
      this.frameCount = 0;
      this.lastFpsTime = Date.now();
      this.currentFps = 60;
    }
  };

  const validateFrameBounds = (frame: fabric.Object): boolean => {
    if (!canvasInstance.current) return false;
    
    const canvas = canvasInstance.current;
    const minSize = 50; // 最小尺寸
    const maxSize = Math.min(canvas.width!, canvas.height!) * 0.8; // 最大尺寸
    
    // 使用缩放后的尺寸进行检查
    const scaledWidth = frame.getScaledWidth();
    const scaledHeight = frame.getScaledHeight();
    
    // 检查尺寸
    if (scaledWidth < minSize || scaledHeight < minSize) {
      console.warn(`[CanvasEditor] Frame scaled size too small: ${scaledWidth}x${scaledHeight}`);
      return false;
    }
    
    if (scaledWidth > maxSize || scaledHeight > maxSize) {
      console.warn(`[CanvasEditor] Frame scaled size too large: ${scaledWidth}x${scaledHeight}`);
      return false;
    }
    
    // 检查位置 - 使用getBoundingRect(true)考虑变换矩阵
    const bounds = frame.getBoundingRect(true);
    if (bounds.left < -scaledWidth || bounds.top < -scaledHeight ||
        bounds.left > canvas.width! || bounds.top > canvas.height!) {
      console.warn(`[CanvasEditor] Frame position out of bounds: ${bounds.left},${bounds.top}`);
      return false;
    }
    
    return true;
  };

  const validateImageBounds = (image: fabric.Object): boolean => {
    if (!canvasInstance.current) return false;
    
    const canvas = canvasInstance.current;
    const { selectedFrame } = editState;
    
    if (!selectedFrame) return true; // 没有相框时不限制
    
    // 使用缩放后的尺寸进行检查
    const scaledWidth = image.getScaledWidth();
    const scaledHeight = image.getScaledHeight();
    const minSize = 20; // 最小缩放后尺寸
    const maxSize = Math.max(canvas.width!, canvas.height!) * 2; // 最大缩放后尺寸
    
    // 确保图片缩放后不会太小
    if (scaledWidth < minSize || scaledHeight < minSize) {
      console.warn(`[CanvasEditor] Image scaled size too small: ${scaledWidth}x${scaledHeight}`);
      return false;
    }
    
    // 确保图片缩放后不会太大
    if (scaledWidth > maxSize || scaledHeight > maxSize) {
      console.warn(`[CanvasEditor] Image scaled size too large: ${scaledWidth}x${scaledHeight}`);
      return false;
    }
    
    // 使用getBoundingRect(true)考虑变换矩阵进行位置检查
    const bounds = image.getBoundingRect(true);
    
    return true;
  };

  // 获取相框-图片组合（增强版，支持重建后的稳定识别）
  const getFrameImagePair = (selectedObject: fabric.Object): { frame: fabric.Object | null, image: fabric.Image | null } => {
    if (!canvasInstance.current) return { frame: null, image: null };
    
    const canvas = canvasInstance.current;
    const objects = canvas.getObjects();
    
    console.log('[getFrameImagePair] 开始查找配对，选中对象类型:', selectedObject.type);
    
    // 如果选中的是相框
    if (selectedObject.type === 'circle' || selectedObject.type === 'rect') {
      const frame = selectedObject;
      
      // 优先使用新的ID系统 (__uid 和 _frameId)
      const frameUid = (frame as any).__uid;
      let image: fabric.Image | undefined;
      
      if (frameUid) {
        image = objects.find(obj => 
          obj.type === 'image' && 
          (obj as any)._frameId === frameUid
        ) as fabric.Image | undefined;
        
        if (image) {
          console.log('[getFrameImagePair] 通过新ID系统找到配对图片');
          return { frame, image };
        }
      }
      
      // 如果新ID系统找不到，尝试旧的ID系统 (id 和 frameId)
      const frameId = (frame as any).id;
      if (frameId) {
        image = objects.find(obj => 
          obj.type === 'image' && 
          (obj as any).frameId === frameId
        ) as fabric.Image | undefined;
        
        if (image) {
          console.log('[getFrameImagePair] 通过旧ID系统找到配对图片');
          return { frame, image };
        }
      }
      
      // 如果ID系统都找不到，尝试位置相邻检测（作为备用方案）
      const frameIndex = objects.indexOf(frame);
      if (frameIndex >= 0 && frameIndex < objects.length - 1) {
        const nextObj = objects[frameIndex + 1];
        if (nextObj.type === 'image') {
          console.log('[getFrameImagePair] 通过位置相邻检测找到可能的配对图片');
          return { frame, image: nextObj as fabric.Image };
        }
      }
      
      console.log('[getFrameImagePair] 未找到相框的配对图片');
      return { frame, image: null };
    }
    
    // 如果选中的是图片
    if (selectedObject.type === 'image') {
      const image = selectedObject as fabric.Image;
      
      // 优先使用新的ID系统
      let frameId = (image as any)._frameId;
      let frame: fabric.Object | undefined;
      
      if (frameId) {
        frame = objects.find(obj => 
          (obj.type === 'circle' || obj.type === 'rect') && 
          (obj as any).__uid === frameId
        );
        
        if (frame) {
          console.log('[getFrameImagePair] 通过新ID系统找到配对相框');
          return { frame, image };
        }
      }
      
      // 如果新ID系统找不到，尝试旧的ID系统
      frameId = (image as any).frameId;
      if (frameId) {
        frame = objects.find(obj => 
          (obj.type === 'circle' || obj.type === 'rect') && 
          (obj as any).id === frameId
        );
        
        if (frame) {
          console.log('[getFrameImagePair] 通过旧ID系统找到配对相框');
          return { frame, image };
        }
      }
      
      // 如果ID系统都找不到，尝试位置相邻检测（作为备用方案）
      const imageIndex = objects.indexOf(image);
      if (imageIndex > 0) {
        const prevObj = objects[imageIndex - 1];
        if (prevObj.type === 'circle' || prevObj.type === 'rect') {
          console.log('[getFrameImagePair] 通过位置相邻检测找到可能的配对相框');
          return { frame: prevObj, image };
        }
      }
      
      console.log('[getFrameImagePair] 未找到图片的配对相框');
      return { frame: null, image };
    }
    
    // 如果不是相框-图片组合，返回原对象
    console.log('[getFrameImagePair] 选中对象不是相框或图片');
    return { 
      frame: selectedObject.type === 'circle' || selectedObject.type === 'rect' ? selectedObject : null,
      image: selectedObject.type === 'image' ? selectedObject as fabric.Image : null
    };
  };

  // 组移动辅助函数：获取对象在画布中的索引
  const getObjectIndex = (obj: fabric.Object): number => {
    if (!canvasInstance.current) return -1;
    const objects = canvasInstance.current.getObjects();
    return objects.indexOf(obj);
  };

  // 组移动辅助函数：重新排列画布对象
  // ✅ 用 moveTo 重排；不要 clear()+add()
  const reorderCanvasObjects = (newOrder: fabric.Object[]) => {
    if (!canvasInstance.current) return;
    const canvas = canvasInstance.current;
    
    // 防御：把 newOrder 里没列到但仍在画布的对象补回
    const all = canvas.getObjects();
    const set = new Set(newOrder);
    const finalOrder = [...newOrder, ...all.filter(o => !set.has(o))];
    
    // 批量移动时先关掉逐项渲染
    const prev = canvas.renderOnAddRemove;
    canvas.renderOnAddRemove = false;
    
    finalOrder.forEach((obj, idx) => {
      canvas.moveTo(obj, idx); // 0 底部，越大越靠上
    });
    
    canvas.renderOnAddRemove = prev;
    canvas.requestRenderAll(); // 用 requestRenderAll
  };

  // 拿到一组要一起移动的对象（相框+图片 或 单个对象），保持它们的相对顺序
  const getStackGroup = (obj: fabric.Object): fabric.Object[] => {
    const { frame, image } = getFrameImagePair(obj);
    if (!canvasInstance.current) return [obj];
    if (frame && image) {
      const order = canvasInstance.current.getObjects();
      return [frame, image].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    return [obj];
  };

  // 把 group 这一"连续块"放到从 startIndex 开始的位置（保持 group 内相对顺序）
  const moveGroupTo = (group: fabric.Object[], startIndex: number) => {
    if (!canvasInstance.current) return;
    const canvas = canvasInstance.current;
    const order = canvas.getObjects().filter(o => !group.includes(o));
    const clamped = Math.max(0, Math.min(startIndex, order.length));
    const newOrder = [
      ...order.slice(0, clamped),
      ...group,
      ...order.slice(clamped),
    ];
    reorderCanvasObjects(newOrder);
  };

  const moveGroupBy = (group: fabric.Object[], delta: number) => {
    if (!canvasInstance.current) return;
    const order = canvasInstance.current.getObjects();
    const start = group.map(o => order.indexOf(o)).sort((a,b)=>a-b)[0];
    moveGroupTo(group, start + delta);
  };

  // ⬆️一层
  const moveGroupForward = (frame: fabric.Object, image: fabric.Image) =>
    moveGroupBy(getStackGroup(frame), +1);

  // ⬇️一层
  const moveGroupBackward = (frame: fabric.Object, image: fabric.Image) =>
    moveGroupBy(getStackGroup(frame), -1);

  // 置顶
  const moveGroupToFront = (frame: fabric.Object, image: fabric.Image) => {
    if (!canvasInstance.current) return;
    const group = getStackGroup(frame);
    const topIndex = canvasInstance.current.getObjects().length - group.length;
    moveGroupTo(group, topIndex);
  };

  // 置底
  const moveGroupToBack = (frame: fabric.Object, image: fabric.Image) =>
    moveGroupTo(getStackGroup(frame), 0);

// 自动重建配对函数：确保相框在下、图片在上、二者相邻
const rebuildFrameImagePairs = () => {
  if (!canvasInstance.current) return;
  
  console.log('[CanvasEditor] rebuildFrameImagePairs - 开始重建配对关系');
  
  const objects = canvasInstance.current.getObjects();
  const frames: fabric.Object[] = [];
  const images: fabric.Image[] = [];
  const others: fabric.Object[] = [];
  
  // 分类所有对象
  objects.forEach(obj => {
    if ((obj as any)._isFrame || (obj as any)._isEmptyFrame) {
      frames.push(obj);
    } else if ((obj as any)._isImage || (obj as any)._isFrameImage) {
      images.push(obj as fabric.Image);
    } else {
      others.push(obj);
    }
  });
  
  console.log('[CanvasEditor] rebuildFrameImagePairs - 找到', frames.length, '个相框，', images.length, '个图片');
  
  // 建立配对关系
  const pairs: Array<{frame: fabric.Object, image: fabric.Image}> = [];
  const usedFrames = new Set<fabric.Object>();
  const usedImages = new Set<fabric.Image>();
  
  // 首先通过新ID系统配对
  frames.forEach(frame => {
    if (usedFrames.has(frame)) return;
    
    const frameUid = (frame as any).__uid;
    if (frameUid) {
      const matchingImage = images.find(img => 
        !usedImages.has(img) && (img as any)._frameId === frameUid
      );
      if (matchingImage) {
        pairs.push({frame, image: matchingImage});
        usedFrames.add(frame);
        usedImages.add(matchingImage);
        console.log('[CanvasEditor] rebuildFrameImagePairs - 通过新ID配对:', frameUid);
      }
    }
  });
  
  // 然后通过旧ID系统配对
  frames.forEach(frame => {
    if (usedFrames.has(frame)) return;
    
    const frameId = (frame as any).id;
    if (frameId) {
      const matchingImage = images.find(img => 
        !usedImages.has(img) && (img as any).frameId === frameId
      );
      if (matchingImage) {
        pairs.push({frame, image: matchingImage});
        usedFrames.add(frame);
        usedImages.add(matchingImage);
        console.log('[CanvasEditor] rebuildFrameImagePairs - 通过旧ID配对:', frameId);
      }
    }
  });
  
  console.log('[CanvasEditor] rebuildFrameImagePairs - 成功配对', pairs.length, '组');
  
  // 重新排列对象：其他对象 + 配对组合（相框在下，图片在上）+ 未配对对象
  const newOrder: fabric.Object[] = [];
  
  // 添加其他对象（非相框非图片）
  newOrder.push(...others);
  
  // 添加配对的组合，确保相框在下、图片在上、二者相邻
  pairs.forEach(({frame, image}) => {
    newOrder.push(frame, image); // 相框在下，图片在上
  });
  
  // 添加未配对的相框
  frames.forEach(frame => {
    if (!usedFrames.has(frame)) {
      newOrder.push(frame);
    }
  });
  
  // 添加未配对的图片
  images.forEach(image => {
    if (!usedImages.has(image)) {
      newOrder.push(image);
    }
  });
  
  // 应用新的对象顺序
  reorderCanvasObjects(newOrder);
  
  console.log('[CanvasEditor] rebuildFrameImagePairs - 重建完成，新顺序长度:', newOrder.length);
};

// 清理对象
  const cleanupObject = (obj: fabric.Object) => {
    if (!validateObject(obj, 'cleanupObject')) return;

    // 清理图片轮廓和边框
    const outline = (obj as any).outline;
    const imageBorder = (obj as any).imageBorder;
    if (outline && canvasInstance.current) {
      canvasInstance.current.remove(outline);
    }
    if (imageBorder && canvasInstance.current) {
      canvasInstance.current.remove(imageBorder);
    }

    // 重置对象的选择样式
    obj.set({
      hasBorders: false,
      hasControls: false,
    });
  };

  // 生成唯一ID
  const generateUniqueId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // 获取相框中的图片 - 基于ID绑定
  const getImageInFrame = (frame: fabric.Object): fabric.Image | null => {
    if (!canvasInstance.current) return null;

    const frameId = (frame as any).__uid;
    if (!frameId) return null;

    const objects = canvasInstance.current.getObjects();
    return objects.find(obj => {
      if (!isImageObject(obj)) return false;
      const img = obj as fabric.Image;
      return (img as any)._frameId === frameId && (img as any)._isFrameImage;
    }) as fabric.Image | null;
  };

  // 获取图片所属的相框 - 基于ID绑定
  const getFrameOfImage = (image: fabric.Image): fabric.Object | null => {
    if (!canvasInstance.current) return null;

    const imageFrameId = (image as any)._frameId;
    if (!imageFrameId) return null;

    const objects = canvasInstance.current.getObjects();
    return objects.find(obj => {
      if (!isFrameObject(obj)) return false;
      return (obj as any).__uid === imageFrameId;
    }) || null;
  };



  // 判断是否为相框对象
  const isFrameObject = (obj: fabric.Object): boolean => {
    return !!(obj as any)._isFrame;
  };

  // 判断是否为图片对象
  const isImageObject = (obj: fabric.Object): boolean => {
    return obj.type === 'image' || !!(obj as any)._isImage;
  };

  // 判断是否为相框图片
  const isFrameImage = (obj: fabric.Object): boolean => {
    return isImageObject(obj) && !!(obj as any)._isFrameImage;
  };

  // 智能选择可操作的对象
  const findOperableObject = (): fabric.Object | null => {
    if (!canvasInstance.current) return null;
    
    const objects = canvasInstance.current.getObjects();
    if (objects.length === 0) return null;
    
    // 优先级1: 查找可选择的对象（从最上层开始）
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.visible !== false && obj.selectable !== false) {
        console.log('[CanvasEditor] findOperableObject - 找到可选择对象:', obj);
        return obj;
      }
    }
    
    // 优先级2: 查找相框对象（相框通常应该可操作）
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.visible !== false && isFrameObject(obj)) {
        console.log('[CanvasEditor] findOperableObject - 找到相框对象:', obj);
        return obj;
      }
    }
    
    // 优先级3: 查找任何可见对象
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.visible !== false) {
        console.log('[CanvasEditor] findOperableObject - 找到可见对象:', obj);
        return obj;
      }
    }
    
    console.log('[CanvasEditor] findOperableObject - 没有找到可操作的对象');
    return null;
  };

  // 选择创建事件
  const handleSelectionCreated = (e: fabric.IEvent) => {
    const target = e.target;
    if (!target) return;

    // 获取相框-图片组合信息
    const { frame, image } = getFrameImagePair(target);

    // 如果当前是相框编辑模式，并且点击的是图片，则忽略图片选择，保持相框选中
    if (editStateRef.current.mode === 'frame' && isFrameImage(target)) {
      // 阻止图片被选中，保持相框选中状态
      const currentFrame = editStateRef.current.selectedFrame;
      if (currentFrame) {
        canvasInstance.current!.discardActiveObject();
        canvasInstance.current!.setActiveObject(currentFrame);
        canvasInstance.current!.renderAll();
        return;
      }
    }

    // 在图片编辑模式下，如果点击相框，允许选择相框进行移动
    if (editStateRef.current.mode === 'image' && isFrameObject(target)) {
      // 保持图片编辑模式，但允许相框被选中和移动
      // 不调用enterFrameEditMode，避免模式切换
      setSelectedObject(target);
      props.onSelectionChange?.(target);
      return;
    }

    // 点击到相框图片，但当前不是图片编辑态 → 自动切换到相框编辑
    if (isFrameImage(target) && editStateRef.current.mode !== 'image') {
      const frameOfImage = getFrameOfImage(target as fabric.Image);
      if (frameOfImage) {
        // 取消当前选择，激活相框
        canvasInstance.current!.discardActiveObject();
        canvasInstance.current!.setActiveObject(frameOfImage);
        enterFrameEditMode(frameOfImage);
        canvasInstance.current!.renderAll();
        props.onSelectionChange?.(frameOfImage);
        return;
      }
    }

    // 正常的相框选择 → 相框编辑
    if (isFrameObject(target)) {
      enterFrameEditMode(target);
    } else if (isFrameImage(target)) {
      // 只有在"图片编辑态"我们才保持图片可交互；否则这分支不会走到这里（上面已拦截）
      target.set({ selectable: true, evented: true });
    }

    // 对于相框-图片组合，确保选择事件传递的是当前选中的对象
    // 但图层操作会同时处理整个组合
    setSelectedObject(target || null);
    props.onSelectionChange?.(target || null);
  };

  // 选择更新事件
  const handleSelectionUpdated = (e: fabric.IEvent) => {
    handleSelectionCreated(e);
  };

  // 选择清除事件
  const handleSelectionCleared = () => {
    exitEditMode();
    setSelectedObject(null);
    props.onSelectionChange?.(null);
    
    // 失焦时重建配对关系，确保相框在下、图片在上、二者相邻
    rebuildFrameImagePairs();
  };

  // 鼠标按下事件
  const handleMouseDown = (e: fabric.IEvent) => {
    setEditState(prev => ({ ...prev, isDragging: true }));
    const target = e.target;

    if (target && isFrameObject(target) && (editStateRef.current.mode === 'frame' || editStateRef.current.mode === 'image')) {
      const img = getImageInFrame(target);
      if (img) {
        (target as any)._imgOffsetX = (img.left || 0) - (target.left || 0);
        (target as any)._imgOffsetY = (img.top  || 0) - (target.top  || 0);
      }
    }
  };

  // 鼠标移动事件
  const handleMouseMove = (e: fabric.IEvent) => {
    // 可以在这里添加拖拽时的实时更新逻辑
  };

  // 鼠标释放事件
  const handleMouseUp = (e: fabric.IEvent) => {
    setEditState(prev => ({ ...prev, isDragging: false }));
  };

  // 右键菜单处理函数
  const handleContextMenu = (e: fabric.IEvent) => {
    e.e.preventDefault(); // 阻止浏览器默认右键菜单
    
    const target = e.target;
    let operableTarget = target;
    
    // 如果没有直接点击到对象，尝试查找可操作的对象
    if (!operableTarget && canvasInstance.current) {
      operableTarget = findOperableObject();
    }
    
    // 只有在有可操作对象时才显示右键菜单
    if (operableTarget && canvasInstance.current && 
        (operableTarget.selectable !== false || operableTarget.type === 'image')) {
      
      // 获取画布容器的位置信息
      const canvasContainer = canvasRef.current?.parentElement;
      const containerRect = canvasContainer?.getBoundingClientRect();
      
      // 计算相对于画布容器的位置
      const menuX = containerRect ? e.e.clientX - containerRect.left : e.e.clientX;
      const menuY = containerRect ? e.e.clientY - containerRect.top : e.e.clientY;
      
      console.log('[CanvasEditor] 右键菜单 - 目标对象:', operableTarget, '位置:', { x: menuX, y: menuY });
      
      setContextMenu({
        visible: true,
        x: menuX,
        y: menuY,
        targetObject: operableTarget
      });
      
      // 确保目标对象被选中
      canvasInstance.current.setActiveObject(operableTarget);
      canvasInstance.current.renderAll();
    }
  };

  // 隐藏右键菜单
  const hideContextMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  // 添加全局点击监听器来隐藏右键菜单
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (contextMenu.visible) {
        hideContextMenu();
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('click', handleGlobalClick);
    }

    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [contextMenu.visible]);

  // 内部图层操作函数
  const performBringForward = () => {
    if (!canvasInstance.current) return;
    
    rebuildFrameImagePairs();
    let activeObject = canvasInstance.current.getActiveObject();
    
    if (!activeObject) {
      activeObject = findOperableObject();
    }
    
    if (activeObject) {
      const { frame, image } = getFrameImagePair(activeObject);
      
      if (frame && image) {
        moveGroupForward(frame, image);
      } else {
        canvasInstance.current.bringForward(activeObject);
        canvasInstance.current.renderAll();
      }
      
      if (!activeObject.selectable) {
        activeObject.set({ selectable: true, evented: true });
      }
      
      canvasInstance.current.setActiveObject(activeObject);
      canvasInstance.current.renderAll();
    }
  };

  const performSendBackwards = () => {
    if (!canvasInstance.current) return;
    
    rebuildFrameImagePairs();
    let activeObject = canvasInstance.current.getActiveObject();
    
    if (!activeObject) {
      activeObject = findOperableObject();
    }
    
    if (activeObject) {
      const { frame, image } = getFrameImagePair(activeObject);
      
      if (frame && image) {
         moveGroupBackward(frame, image);
       } else {
        canvasInstance.current.sendBackwards(activeObject);
        canvasInstance.current.renderAll();
      }
      
      if (!activeObject.selectable) {
        activeObject.set({ selectable: true, evented: true });
      }
      
      canvasInstance.current.setActiveObject(activeObject);
      canvasInstance.current.renderAll();
    }
  };

  const performBringToFront = () => {
    if (!canvasInstance.current) return;
    
    rebuildFrameImagePairs();
    let activeObject = canvasInstance.current.getActiveObject();
    
    if (!activeObject) {
      activeObject = findOperableObject();
    }
    
    if (activeObject) {
      const { frame, image } = getFrameImagePair(activeObject);
      
      if (frame && image) {
        moveGroupToFront(frame, image);
      } else {
        canvasInstance.current.bringToFront(activeObject);
        canvasInstance.current.renderAll();
      }
      
      if (!activeObject.selectable) {
        activeObject.set({ selectable: true, evented: true });
      }
      
      canvasInstance.current.setActiveObject(activeObject);
      canvasInstance.current.renderAll();
    }
  };

  const performSendToBack = () => {
    if (!canvasInstance.current) return;
    
    rebuildFrameImagePairs();
    let activeObject = canvasInstance.current.getActiveObject();
    
    if (!activeObject) {
      activeObject = findOperableObject();
    }
    
    if (activeObject) {
      const { frame, image } = getFrameImagePair(activeObject);
      
      if (frame && image) {
        moveGroupToBack(frame, image);
      } else {
        canvasInstance.current.sendToBack(activeObject);
        canvasInstance.current.renderAll();
      }
      
      if (!activeObject.selectable) {
        activeObject.set({ selectable: true, evented: true });
      }
      
      canvasInstance.current.setActiveObject(activeObject);
      canvasInstance.current.renderAll();
    }
  };

  // 右键菜单项点击处理
  const handleContextMenuAction = (action: string) => {
    const target = contextMenu.targetObject;
    if (!target || !canvasInstance.current) return;
    
    console.log('[CanvasEditor] 执行右键菜单操作:', action, '目标对象:', target);
    
    // 确保目标对象被选中
    canvasInstance.current.setActiveObject(target);
    
    // 执行对应的图层操作
    switch (action) {
      case 'bringForward':
        performBringForward();
        break;
      case 'sendBackwards':
        performSendBackwards();
        break;
      case 'bringToFront':
        performBringToFront();
        break;
      case 'sendToBack':
        performSendToBack();
        break;
    }
    
    // 隐藏菜单
    hideContextMenu();
  };

  // 对象变换事件
  const handleObjectModified = (e: fabric.IEvent) => {
    const target = e.target;
    if (!validateObject(target, 'handleObjectModified')) return;

    try {
      // 根据对象类型进行边界检查
      if (isFrameObject(target)) {
        if (!validateFrameBounds(target)) {
          // 如果边界检查失败，撤销这次变换
          historyManagerRef.current.undo();
          return;
        }
      } else if (isImageObject(target)) {
        if (!validateImageBounds(target)) {
          // 如果边界检查失败，撤销这次变换
          historyManagerRef.current.undo();
          return;
        }
      }

      // 同步裁剪路径和高亮对象
      if (isFrameObject(target)) {
        syncClipPathOnTransform(target);
        // 使用原生选择样式，无需额外同步
      }

      // 更新图片编辑模式的视觉反馈
      if (editStateRef.current.mode === 'image' && editStateRef.current.selectedImage === target) {
        updateImageEditModeVisuals();
      }

      // 保存状态到历史
      saveStateToHistory();
    } catch (error) {
      console.error('[CanvasEditor] Error in handleObjectModified:', error);
      // 发生错误时撤销这次变换
      historyManagerRef.current.undo();
    }
  };

  // 对象缩放事件 - 使用节流优化
  const handleObjectScaling = (e: fabric.IEvent) => {
    const target = e.target;
    if (!validateObject(target, 'handleObjectScaling')) return;

    try {
      // 实时同步相框裁剪路径、图片缩放和高亮对象
      if (isFrameObject(target)) {
        syncClipPathOnTransform(target);
        // 使用原生选择样式，无需额外同步
      }

      // 实时更新图片编辑模式的视觉反馈
      if (editStateRef.current.mode === 'image' && editStateRef.current.selectedImage === target) {
        updateImageEditModeVisuals();
      }

      // 在图片编辑模式下，如果缩放的是相框，也需要同步裁剪路径
      if (editStateRef.current.mode === 'image' && isFrameObject(target) && target === editStateRef.current.selectedFrame) {
        syncClipPathOnTransform(target);
      }
    } catch (error) {
      console.error('[CanvasEditor] Error in handleObjectScaling:', error);
    }
  };

  // 对象旋转事件 - 使用节流优化
  const handleObjectRotating = (e: fabric.IEvent) => {
    const target = e.target;
    if (!validateObject(target, 'handleObjectRotating')) return;

    try {
      // 实时更新图片编辑模式的视觉反馈
      if (editStateRef.current.mode === 'image' && editStateRef.current.selectedImage === target) {
        updateImageEditModeVisuals();
      }
    } catch (error) {
      console.error('[CanvasEditor] Error in handleObjectRotating:', error);
    }
  };

  // 处理对象移动 - 使用节流优化
  const handleObjectMoving = (e: fabric.IEvent) => {
    const obj = e.target;
    if (!validateObject(obj, 'handleObjectMoving')) return;

    try {
      if (isFrameObject(obj)) {
        // 在相框编辑模式或图片编辑模式下，都需要让图片跟随相框移动
        if (editStateRef.current.mode === 'frame' || editStateRef.current.mode === 'image') {
          const img = getImageInFrame(obj);
          if (img) {
            const ox = (obj as any)._imgOffsetX ?? 0;
            const oy = (obj as any)._imgOffsetY ?? 0;
            img.set({
              left: (obj.left || 0) + ox,
              top:  (obj.top  || 0) + oy,
            });
            img.setCoords();
          }
        }
        // 裁剪中心同步
        syncClipPathOnTransform(obj);
      } else if (isImageObject(obj)) {
        // 图片编辑模式下更新视觉反馈
        if (editStateRef.current.mode === 'image' && editStateRef.current.selectedImage === obj) {
          updateImageEditModeVisuals();
        }
      }
    } catch (error) {
      console.error('[CanvasEditor] Error in handleObjectMoving:', error);
    }
  };

  // 双击事件防抖
  const lastDoubleClickTime = useRef(0);
  const DOUBLE_CLICK_DEBOUNCE = 300; // 300ms 防抖

  // 双击事件处理 - 实现模式切换和空相框上传
  const handleDoubleClick = (e: fabric.IEvent) => {
    const now = Date.now();
    
    // 防抖检查
    if (now - lastDoubleClickTime.current < DOUBLE_CLICK_DEBOUNCE) {
      console.log('[CanvasEditor] 双击事件被防抖忽略');
      return;
    }
    lastDoubleClickTime.current = now;

    console.log('[CanvasEditor] 双击事件触发');
    if (!canvasInstance.current) {
      console.log('[CanvasEditor] 画布实例不存在');
      return;
    }

    const target = e.target;
    console.log('[CanvasEditor] 双击目标:', target);
    if (!target) {
      console.log('[CanvasEditor] 没有双击目标');
      return;
    }

    try {
      console.log('[CanvasEditor] 目标对象属性:', {
        _isFrame: (target as any)._isFrame,
        _isEmptyFrame: (target as any)._isEmptyFrame,
        _frameType: (target as any)._frameType,
        type: target.type,
        selectable: target.selectable,
        evented: target.evented
      });

      // 1) 双击"相框"：如果已放图 → 进入图片编辑；如果是空相框 → 打开上传
      if (isFrameObject(target)) {
        console.log('[CanvasEditor] 识别为相框对象');
        if ((target as any)._isEmptyFrame) {
          console.log('[CanvasEditor] 空相框，触发文件上传');
          triggerFileUpload(target);
          return;
        }
        const img = getImageInFrame(target);
        if (img) {
          console.log('[CanvasEditor] 相框有图片，进入图片编辑模式');
          enterImageEditMode(img);
        }
        return;
      }

      // 2) 双击"相框图片"：同样进入图片编辑
      if (isFrameImage(target)) {
        console.log('[CanvasEditor] 识别为相框图片，进入图片编辑模式');
        enterImageEditMode(target as fabric.Image);
      }
    } catch (error) {
      console.error('[CanvasEditor] Error in handleDoubleClick:', error);
    }
  };

  // 防重复触发的状态
  const isUploadingRef = useRef(false);

  // 触发文件上传对话框
  const triggerFileUpload = (frame: fabric.Object) => {
    console.log('[CanvasEditor] triggerFileUpload 被调用，相框:', frame);
    
    // 防重复触发检查
    if (isUploadingRef.current) {
      console.log('[CanvasEditor] 文件上传已在进行中，忽略重复触发');
      return;
    }
    
    if (!canvasInstance.current) {
      console.log('[CanvasEditor] 画布实例不存在，无法触发文件上传');
      return;
    }

    // 设置上传状态
    isUploadingRef.current = true;

    // 创建隐藏的文件输入框
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    console.log('[CanvasEditor] 文件输入框已创建');

    // 处理文件选择
    fileInput.onchange = (event) => {
      console.log('[CanvasEditor] 文件选择事件触发');
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (file) {
        console.log('[CanvasEditor] 选择的文件:', file.name);
        uploadImageToFrame(file, frame);
      } else {
        console.log('[CanvasEditor] 没有选择文件');
      }
      
      // 清理文件输入框和重置状态
      document.body.removeChild(fileInput);
      isUploadingRef.current = false;
      console.log('[CanvasEditor] 文件输入框已清理，上传状态已重置');
    };

    // 处理取消选择（ESC键或点击取消）
    fileInput.oncancel = () => {
      console.log('[CanvasEditor] 文件选择被取消');
      document.body.removeChild(fileInput);
      isUploadingRef.current = false;
      console.log('[CanvasEditor] 文件输入框已清理，上传状态已重置');
    };

    // 添加到DOM并触发点击
    document.body.appendChild(fileInput);
    console.log('[CanvasEditor] 文件输入框已添加到DOM');
    fileInput.click();
    console.log('[CanvasEditor] 文件输入框点击事件已触发');
  };

  // 修改uploadImageToFrame函数以支持传入相框参数
  const uploadImageToFrame = (file: File, targetFrame?: fabric.Object) => {
    if (!canvasInstance.current) return;

    // 使用传入的相框或当前选中的相框
    const selectedFrame = targetFrame || editState.selectedFrame;
    if (!selectedFrame || !isFrameObject(selectedFrame)) {
      alert('请先选择一个相框');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;

      fabric.Image.fromURL(url, (img) => {
        // 使用椭圆可视尺寸计算初始缩放
        const rx = selectedFrame.getScaledWidth() / 2;
        const ry = selectedFrame.getScaledHeight() / 2;
        const targetDiameterX = rx * 2;
        const targetDiameterY = ry * 2;
        
        const imgWidth = img.width || 100;
        const imgHeight = img.height || 100;
        
        // 使用cover模式：确保图片完全覆盖椭圆区域
        const scaleX = targetDiameterX / imgWidth;
        const scaleY = targetDiameterY / imgHeight;
        const scale = Math.max(scaleX, scaleY); // cover模式取较大值

        // 确保相框有唯一ID
        if (!(selectedFrame as any).__uid) {
          (selectedFrame as any).__uid = generateUniqueId();
        }

        // 生成图片唯一ID
        const imageId = generateUniqueId();

        // 设置图片属性 - 确保图片在相框中心位置
        img.set({
          left: selectedFrame.left,
          top: selectedFrame.top,
          scaleX: scale,
          scaleY: scale,
          originX: 'center',
          originY: 'center',
          selectable: true,
          hasControls: true,
          hasBorders: true,
          _isFrameImage: true,
          // 保存原始缩放比例，用于相框缩放时的同步计算
          _originalScale: scale,
          // 建立强绑定关系
          __uid: imageId,
          _frameId: (selectedFrame as any).__uid,
        });

        // 在相框中记录图片ID
        (selectedFrame as any)._imageId = imageId;

        // 创建椭圆裁剪路径
        const clipPath = new fabric.Ellipse({
          rx: rx,
          ry: ry,
          left: selectedFrame.left,
          top: selectedFrame.top,
          originX: 'center',
          originY: 'center',
          absolutePositioned: true,
        });

        img.clipPath = clipPath;

        // 移除旧图片和提示文字
        const oldImage = getImageInFrame(selectedFrame);
        if (oldImage) {
          canvasInstance.current?.remove(oldImage);
        }

        // 添加新图片
        canvasInstance.current?.add(img);

        // 更新相框状态
        (selectedFrame as any)._isEmptyFrame = false;

        // 清理相框高亮效果（解决蓝色虚线残留问题）
        setFrameSelectionStyle(selectedFrame, false);

        // 上传成功后进入相框编辑模式，让用户可以立即调整相框大小
        enterFrameEditMode(selectedFrame);

        // 保存状态到历史
        saveStateToHistory();

        canvasInstance.current?.renderAll();
        
        // 通知对象数量变化
        notifyObjectCountChange();
      });
    };

    reader.readAsDataURL(file);
  };

  // 在相框变换时同步裁剪路径
  const syncClipPathOnTransform = (frame: fabric.Object) => {
    if (!validateObject(frame, 'syncClipPathOnTransform')) return;

    const image = getImageInFrame(frame);
    if (!image) return;

    try {
      // 更新图片的裁剪路径和缩放比例
      updateFrameClipPath(frame, image);
      
      // 强制重新渲染
      canvasInstance.current?.renderAll();
    } catch (error) {
      console.error('[CanvasEditor] Error in syncClipPathOnTransform:', error);
    }
  };

  // 更新相框裁剪路径 - 只改变裁剪区域，不移动图片
  const updateFrameClipPath = (frame: fabric.Object, image: fabric.Image) => {
    if (!validateObject(frame, 'updateFrameClipPath')) return;
    if (!validateObject(image, 'updateFrameClipPath')) return;

    try {
      const frameType = (frame as any)._frameType;

      if (frameType === 'circle') {
        const centerX = frame.left || 0;
        const centerY = frame.top || 0;

        // 使用getScaledWidth/Height避免重复缩放
        const rx = frame.getScaledWidth() / 2;
        const ry = frame.getScaledHeight() / 2;

        // 创建新的椭圆裁剪路径 - 只更新裁剪区域的形状和位置
        const clipPath = new fabric.Ellipse({
          rx: rx,
          ry: ry,
          left: centerX,
          top: centerY,
          originX: 'center',
          originY: 'center',
          absolutePositioned: true,
        });

        // 只更新裁剪路径，不改变图片的位置和缩放
        image.clipPath = clipPath;

        // 相框变形时，图片保持原有的位置和缩放不变
        // 只有裁剪区域（透明与不透明区域）会发生变化
        console.log('[CanvasEditor] 相框变形：只更新裁剪路径，图片位置和缩放保持不变');
      }
    } catch (error) {
      console.error('[CanvasEditor] Error in updateFrameClipPath:', error);
    }
  };

  // 进入相框编辑模式
  const enterFrameEditMode = (frame: fabric.Object) => {
    if (!canvasInstance.current) return;

    const image = getImageInFrame(frame);
    // 移除对图片的强制要求，空相框也可以编辑

    // 保存当前状态到历史
    saveStateToHistory();

    // 设置编辑状态
    setEditState({
      mode: 'frame',
      selectedFrame: frame,
      selectedImage: image, // 可能为null（空相框）
      isDragging: false,
    });

    // 如果有图片，锁定图片，只允许编辑相框
    if (image) {
      image.selectable = false;
      image.evented = false;
    }

    // 核心修复：确保相框层级在图片之上，避免被图片遮挡
    canvasInstance.current.bringToFront(frame);

    // 清理偏移缓存，避免历史值干扰
    (frame as any)._imgOffsetX = undefined;
    (frame as any)._imgOffsetY = undefined;

    // 显示相框编辑手柄和高亮效果（使用对象自身边框，不创建额外图层）
    frame.set({
      hasControls: true,
      hasBorders: true,
      borderColor: '#3b82f6',
      borderDashArray: [10, 5],
      borderScaleFactor: 2,
      cornerColor: '#3b82f6',
      cornerSize: 8,
      cornerStyle: 'circle',
      transparentCorners: false,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: true,
      // 在编辑模式下显示半透明背景，让用户能看到相框区域
      fill: image ? 'transparent' : 'rgba(59, 130, 246, 0.1)',
      stroke: '#3b82f6',
      strokeWidth: 2,
    });

    // 通知父组件
    props.onEditModeChange?.('frame', frame);

    canvasInstance.current.renderAll();
  };

  // 进入图片编辑模式
  const enterImageEditMode = (image: fabric.Image) => {
    if (!canvasInstance.current) return;
    const frame = getFrameOfImage(image);
    if (!frame) return;

    saveStateToHistory();

    // 相框设置：允许移动和缩放，但使用不同的视觉样式区分
    frame.set({
      selectable: true,      // 保持可选择，允许移动
      evented: true,         // 保持事件响应
      hasControls: true,     // 显示缩放控制点，允许调整大小
      hasBorders: true,      // 显示边框
      borderColor: '#3b82f6', // 蓝色边框，与图片的橙色区分
      borderDashArray: [5, 5], // 虚线边框，与图片的实线区分
      cornerColor: '#3b82f6', // 蓝色控制点
      cornerSize: 6,         // 稍小的控制点
      cornerStyle: 'rect',   // 方形控制点，与图片的圆形区分
      lockMovementX: false,  // 允许水平移动
      lockMovementY: false,  // 允许垂直移动
      lockScalingX: false,   // 允许水平缩放
      lockScalingY: false,   // 允许垂直缩放
      lockRotation: true,    // 锁定旋转
    });

    // 图片启用
    image.set({
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      borderColor: '#f97316',
      borderDashArray: [10, 5],
      borderScaleFactor: 2,
      cornerColor: '#f97316',
      cornerSize: 8,
      cornerStyle: 'circle',
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    });

    // 核心修复：在图片编辑模式下，确保图片层级在相框之上
    canvasInstance.current.bringToFront(image);

    setEditState({ mode: 'image', selectedFrame: frame, selectedImage: image, isDragging: false });
    canvasInstance.current.setActiveObject(image);
    props.onEditModeChange?.('image', image);
    canvasInstance.current.renderAll();
  };

  // 退出编辑模式
  const exitEditMode = () => {
    if (!canvasInstance.current) return;

    const { mode, selectedFrame, selectedImage } = editState;

    if (mode === 'frame' && selectedFrame) {
      // 如果有图片，恢复图片可选择性
      if (selectedImage) {
        selectedImage.selectable = true;
        selectedImage.evented = true;
      }

      // 恢复相框默认状态，但保持可编辑性
      selectedFrame.set({
        hasControls: true,  // 保持控件可见
        hasBorders: true,   // 保持边框可见
        borderColor: 'rgba(102, 153, 255, 0.75)',
        cornerColor: 'rgba(102, 153, 255, 0.5)',
        cornerSize: 6,
        cornerStyle: 'rect',
        transparentCorners: true,
        // 确保相框保持可编辑状态
        selectable: true,
        evented: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: true,
        // 恢复透明状态
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
      });
    } else if (mode === 'image' && selectedFrame && selectedImage) {
      // 恢复相框可选择性
      selectedFrame.selectable = true;
      selectedFrame.evented = true;
      // 确保相框在图片编辑模式退出后也保持可编辑
      selectedFrame.set({
        hasControls: true,
        hasBorders: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: true,
      });

      // 关键：让图片在"默认/相框编辑"状态下不可交互
      selectedImage.set({
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        hoverCursor: 'default',
        moveCursor: 'default',
      });

      // 核心修复：确保相框层级在图片之上，避免图片遮挡相框
      canvasInstance.current.bringToFront(selectedFrame);

      // 关键修复：退出图片编辑模式后，自动选中相框并进入相框编辑模式
      canvasInstance.current.setActiveObject(selectedFrame);
      
      // 设置相框的正确编辑样式
      selectedFrame.set({
        hasControls: true,
        hasBorders: true,
        borderColor: '#3b82f6',
        borderDashArray: [10, 5],
        borderScaleFactor: 2,
        cornerColor: '#3b82f6',
        cornerSize: 8,
        cornerStyle: 'circle',
        transparentCorners: false,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: true,
        // 在编辑模式下显示半透明背景，让用户能看到相框区域
        fill: selectedImage ? 'transparent' : 'rgba(59, 130, 246, 0.1)',
        stroke: '#3b82f6',
        strokeWidth: 2,
      });
      
      // 进入相框编辑模式，而不是完全退出编辑
      setEditState({
        mode: 'frame',
        selectedFrame: selectedFrame,
        selectedImage: selectedImage,
        isDragging: false,
      });

      // 通知父组件进入相框编辑模式
      props.onEditModeChange?.('frame', selectedFrame);

      // 强制重新渲染画布
      canvasInstance.current.renderAll();
      return; // 提前返回，不执行下面的完全退出逻辑
    }

    // 只有在相框编辑模式或其他情况下才完全退出
    // 显式清空画布的活动对象选择
    canvasInstance.current.discardActiveObject();
    
    // 重置编辑状态
    setEditState({
      mode: null,
      selectedFrame: null,
      selectedImage: null,
      isDragging: false,
    });

    // 通知父组件
    props.onEditModeChange?.(null, null);

    // 强制重新渲染画布
    canvasInstance.current.renderAll();
  };

  // 设置相框的原生选择样式
  const setFrameSelectionStyle = (frame: fabric.Object, isSelected: boolean) => {
    if (isSelected) {
      frame.set({
        borderColor: '#3b82f6',
        borderDashArray: [10, 5],
        borderScaleFactor: 2,
        hasBorders: true,
        hasControls: true,
      });
    } else {
      frame.set({
        hasBorders: false,
        hasControls: false,
      });
    }
  };

  // 保存状态到历史
  // 原始的保存状态函数
  const saveStateToHistoryImmediate = () => {
    if (!canvasInstance.current) return;

    const state = canvasInstance.current.toJSON();
    historyManagerRef.current.push(state);
    
    // 通知外部变化
    props.onChange?.();
  };

  // 防抖版本的保存状态函数，避免频繁保存
  const saveStateToHistory = debounce(saveStateToHistoryImmediate, 500);

  // 撤销
  const undo = () => {
    const state = historyManagerRef.current.undo();
    if (state && canvasInstance.current) {
      canvasInstance.current.loadFromJSON(state, () => {
        canvasInstance.current?.renderAll();
      });
    }
  };

  // 重做
  const redo = () => {
    const state = historyManagerRef.current.redo();
    if (state && canvasInstance.current) {
      canvasInstance.current.loadFromJSON(state, () => {
        canvasInstance.current?.renderAll();
      });
    }
  };

  // 删除选中对象
  const deleteSelected = () => {
    if (!canvasInstance.current) return;

    const activeObject = canvasInstance.current.getActiveObject();
    if (!activeObject) return;

    // 保存状态到历史记录
    saveStateToHistory();

    // 如果删除的是相框，同时删除对应的图片
    if (isFrameObject(activeObject)) {
      const image = getImageInFrame(activeObject);
      if (image) {
        canvasInstance.current.remove(image);
      }
      // 如果当前在相框编辑模式，退出编辑模式
      if (editState.mode === 'frame' && editState.selectedFrame === activeObject) {
        setEditState({
          mode: null,
          selectedFrame: null,
          selectedImage: null,
          isDragging: false
        });
        props.onEditModeChange?.(null, null);
      }
    }
    
    // 如果删除的是相框内的图片，只删除图片，保留相框
    else if (isImageObject(activeObject) && (activeObject as any)._isFrameImage) {
      const frame = getFrameOfImage(activeObject as fabric.Image);
      // 如果当前在图片编辑模式，退出编辑模式并选中相框
      if (editState.mode === 'image' && editState.selectedImage === activeObject) {
        if (frame) {
          canvasInstance.current.setActiveObject(frame);
          setEditState({
            mode: 'frame',
            selectedFrame: frame,
            selectedImage: null,
            isDragging: false
          });
          props.onEditModeChange?.('frame', frame);
        } else {
          setEditState({
            mode: null,
            selectedFrame: null,
            selectedImage: null,
            isDragging: false
          });
          props.onEditModeChange?.(null, null);
        }
      }
    }
    
    // 如果删除的是普通图片或其他元素
    else {
      // 如果当前有编辑模式，退出编辑模式
      if (editState.mode !== null) {
        setEditState({
          mode: null,
          selectedFrame: null,
          selectedImage: null,
          isDragging: false
        });
        props.onEditModeChange?.(null, null);
      }
    }

    // 删除选中的对象
    canvasInstance.current.remove(activeObject);
    canvasInstance.current.discardActiveObject();
    canvasInstance.current.renderAll();
    
    // 通知选择变化
    props.onSelectionChange?.(null);
    
    // 通知对象数量变化
    notifyObjectCountChange();
  };

  // 更新图片编辑模式的视觉反馈 - 使用批量渲染优化
  const updateImageEditModeVisuals = debounce(() => {
    if (!validateCanvas('updateImageEditModeVisuals')) return;

    const { mode } = editState;

    if (mode === 'image') {
      // 不创建遮罩/额外边框，仅批量渲染
      batchRender();
    }
  }, 50); // 50ms防抖

  // 监听图片变换事件
  const handleImageTransform = (e: fabric.IEvent) => {
    const target = e.target;
    if (!target || !isImageObject(target)) return;

    updateImageEditModeVisuals();
  };

  // 使用 useImperativeHandle 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    addImage: (url: string, options?: fabric.IImageOptions) => {
      if (!canvasInstance.current) return;

      fabric.Image.fromURL(url, (img) => {
        // 获取图片原始尺寸
        const originalWidth = img.width || 0;
        const originalHeight = img.height || 0;
        
        // 计算适配画布的尺寸和位置
        const fitData = calculateImageFitToCanvas(originalWidth, originalHeight);
        
        img.set({
          left: options?.left ?? fitData.left,
          top: options?.top ?? fitData.top,
          scaleX: options?.scaleX ?? fitData.scale,
          scaleY: options?.scaleY ?? fitData.scale,
          angle: options?.angle || 0,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          _isImage: true,
        });

        canvasInstance.current?.add(img);
        canvasInstance.current?.renderAll();
        
        // 选中新添加的图片
        canvasInstance.current?.setActiveObject(img);
        props.onSelectionChange?.(img);
        
        // 通知对象数量变化
        notifyObjectCountChange();
      }, { crossOrigin: 'anonymous' });
    },

    exportCanvas: (backgroundType: 'transparent' | 'white' = 'white', highResolution: boolean = false) => {
      if (!canvasInstance.current) return '';
      
      try {
        const canvas = canvasInstance.current;
        
        // 如果是透明背景，需要特殊处理
        if (backgroundType === 'transparent') {
          // 临时保存原始背景色
          const originalBackgroundColor = canvas.backgroundColor;
          
          // 设置透明背景
          canvas.setBackgroundColor('transparent', () => {
            canvas.renderAll();
          });
          
          // 设置导出参数 - 导出整个画布，保持原有布局
          const exportOptions: any = {
            format: 'png',
            quality: 1,
          };
          
          // 如果是高分辨率导出，设置更高的倍数
          if (highResolution) {
            exportOptions.multiplier = CANVAS_CONFIG.PRINT_DPI / CANVAS_CONFIG.DISPLAY_DPI; // 300/72 ≈ 4.17倍
          }
          
          // 导出透明背景图片（保持原有画布尺寸和布局）
          const dataUrl = canvas.toDataURL(exportOptions);
          
          // 恢复原始背景色
          canvas.setBackgroundColor(originalBackgroundColor, () => {
            canvas.renderAll();
          });
          
          return dataUrl;
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
          
          return canvas.toDataURL(exportOptions);
        }
      } catch (error) {
        console.warn('[CanvasEditor] Canvas导出失败，可能是由于CORS污染:', error);
        
        // 备用方案：创建一个新的Canvas，重新绘制所有对象
        try {
          const canvas = canvasInstance.current;
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width || 800;
          tempCanvas.height = canvas.height || 600;
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
          
          return tempCanvas.toDataURL('image/png');
        } catch (fallbackError) {
          console.error('[CanvasEditor] 备用导出方案也失败:', fallbackError);
          
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
            return placeholderCanvas.toDataURL('image/png');
          }
          
          return '';
        }
      }
    },

    addCircleFrame: (x: number, y: number, radius: number) => {
      console.log('[CanvasEditor] addCircleFrame 调用参数:', { x, y, radius });
      if (!canvasInstance.current) {
        console.warn('[CanvasEditor] 画布未初始化，无法添加相框');
        return;
      }

      console.log('[CanvasEditor] 当前画布对象数:', canvasInstance.current.getObjects().length);
      saveStateToHistory();

      const frameId = generateUniqueId();
      const frame = new fabric.Circle({
        left: x,
        top: y,
        radius: radius,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        originX: 'center',
        originY: 'center',
        // 明确设置锁定属性
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: true,
        // 相框标识属性
        _isFrame: true,
        _frameType: 'circle',
        _frameRadius: radius,
        _isEmptyFrame: true,
        // 分配唯一ID
        __uid: frameId,
        _imageId: null, // 初始时没有绑定图片
      });

      canvasInstance.current.add(frame);
      console.log('[CanvasEditor] 相框已添加，新的对象数:', canvasInstance.current.getObjects().length);
      // 激活相框并进入相框编辑模式，提供即时可见反馈
      canvasInstance.current.setActiveObject(frame);
      enterFrameEditMode(frame);
      canvasInstance.current.renderAll();
      
      // 通知对象数量变化
      notifyObjectCountChange();
    },

    uploadImageToFrame: (file: File) => {
      uploadImageToFrame(file);
    },
    getCanvasData: () => {
      if (!canvasInstance.current) return '';
      
      // 使用toJSON并指定要包含的自定义属性
      // 包含新旧两套ID系统以确保兼容性
      const canvasData = canvasInstance.current.toJSON([
        '_isFrame', '_isEmptyFrame', '_frameType', '_frameRadius', '__uid', '_imageId',
        '_isImage', '_isFrameImage', '_frameId', 'id', 'frameId'
      ]);
      
      console.log('[CanvasEditor] 保存画布数据:', canvasData);
      
      // 检查每个对象的属性
      if (canvasData.objects) {
        canvasData.objects.forEach((obj: any, index: number) => {
          console.log(`[CanvasEditor] 保存对象 ${index}:`, {
            type: obj.type,
            _isFrame: obj._isFrame,
            _isEmptyFrame: obj._isEmptyFrame,
            _frameType: obj._frameType
          });
        });
      }
      
      return JSON.stringify(canvasData);
    },
    loadCanvasData: (data: string) => {
      if (!canvasInstance.current) return;
      try {
        const jsonData = JSON.parse(data);
        console.log('[CanvasEditor] 开始加载画布数据，原始JSON数据:', jsonData);
        
        canvasInstance.current.loadFromJSON(jsonData, () => {
          // 重新设置画布事件处理器
          setupCanvasEvents();
          
          // 恢复空相框的交互性
          const objects = canvasInstance.current?.getObjects() || [];
          console.log('[CanvasEditor] 加载后的对象数量:', objects.length);
          
          objects.forEach((obj, index) => {
            console.log(`[CanvasEditor] 对象 ${index}:`, {
              type: obj.type,
              _isFrame: (obj as any)._isFrame,
              _isEmptyFrame: (obj as any)._isEmptyFrame,
              _frameType: (obj as any)._frameType,
              selectable: obj.selectable,
              evented: obj.evented
            });
            
            // 检查是否是空相框
            if (isFrameObject(obj) && (obj as any)._isEmptyFrame) {
              console.log('[CanvasEditor] 发现空相框，恢复交互属性');
              // 确保空相框保持可选择和可交互
              obj.set({
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
                hoverCursor: 'pointer',
                moveCursor: 'move',
              });
            }
            
            // 恢复相框的基本交互属性
            if (isFrameObject(obj)) {
              obj.set({
                selectable: true,
                evented: true,
                lockRotation: true,
              });
            }
            
            // 恢复图片的基本交互属性
            if (isImageObject(obj)) {
              obj.set({
                selectable: true,
                evented: true,
              });
            }
          });
          
          canvasInstance.current?.renderAll();
          
          // 重建配对关系，确保相框在下、图片在上、二者相邻
          rebuildFrameImagePairs();
          
          // 通知对象数量变化
          notifyObjectCountChange();
          
          // 确保稳态设置
          canvasInstance.current!.preserveObjectStacking = true;
          canvasInstance.current!.requestRenderAll();
          
          console.log('[CanvasEditor] 画布数据加载成功，对象数:', objects.length);
        });
      } catch (error) {
        console.error('[CanvasEditor] 加载画布数据失败:', error);
      }
    },
    addTemplateImage: (url: string) => {
      if (!canvasInstance.current) return;
      
      fabric.Image.fromURL(url, (img) => {
        // 获取模板图片原始尺寸
        const originalWidth = img.width || 0;
        const originalHeight = img.height || 0;
        
        // 计算适配画布的尺寸和位置
        const fitData = calculateImageFitToCanvas(originalWidth, originalHeight);
        
        // 修复：使用中心点定位，确保与相框（也是中心定位）在保存/加载时行为一致
        // 同时设置 strokeWidth: 0 防止边框导致的微小位移
        img.set({
          left: canvasInstance.current!.width! / 2,
          top: canvasInstance.current!.height! / 2,
          originX: 'center',
          originY: 'center',
          scaleX: fitData.scale,
          scaleY: fitData.scale,
          strokeWidth: 0,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          _isImage: true,
        });
        
        canvasInstance.current?.add(img);
        canvasInstance.current?.renderAll();
        
        // 选中新添加的模板
        canvasInstance.current?.setActiveObject(img);
        props.onSelectionChange?.(img);
        
        // 通知对象数量变化
        notifyObjectCountChange();
      }, { crossOrigin: 'anonymous' });
    },
    bringForward: () => {
      if (!canvasInstance.current) return;
      
      // 先尝试重建配对，确保最新的配对关系
      rebuildFrameImagePairs();
      
      let activeObject = canvasInstance.current.getActiveObject();
      console.log('[CanvasEditor] bringForward - 选中对象:', activeObject);
      
      // 如果没有活动对象，尝试智能选择可操作的对象
      if (!activeObject) {
        activeObject = findOperableObject();
        if (activeObject) {
          console.log('[CanvasEditor] bringForward - 智能选择对象:', activeObject);
        }
      }
      
      if (activeObject) {
        const { frame, image } = getFrameImagePair(activeObject);
        console.log('[CanvasEditor] bringForward - 相框图片组合:', { frame, image });
        
        // 如果是相框-图片组合，使用组移动
        if (frame && image) {
          console.log('[CanvasEditor] bringForward - 使用组移动向前移动相框图片组合');
          moveGroupForward(frame, image);
        } else {
          // 单独对象的处理
          console.log('[CanvasEditor] bringForward - 移动单独对象');
          canvasInstance.current.bringForward(activeObject);
          canvasInstance.current.renderAll();
        }
        
        // 确保操作后对象可以被选择
        if (!activeObject.selectable) {
          activeObject.set({ selectable: true, evented: true });
        }
        
        // 设置为活动对象以便用户看到操作结果
        canvasInstance.current.setActiveObject(activeObject);
        canvasInstance.current.renderAll();
      } else {
        console.log('[CanvasEditor] bringForward - 没有找到可操作的对象');
      }
    },
    sendBackwards: () => {
      if (!canvasInstance.current) return;
      
      // 先尝试重建配对，确保最新的配对关系
      rebuildFrameImagePairs();
      
      let activeObject = canvasInstance.current.getActiveObject();
      console.log('[CanvasEditor] sendBackwards - 选中对象:', activeObject);
      
      // 如果没有活动对象，尝试智能选择可操作的对象
      if (!activeObject) {
        activeObject = findOperableObject();
        if (activeObject) {
          console.log('[CanvasEditor] sendBackwards - 智能选择对象:', activeObject);
        }
      }
      
      if (activeObject) {
        const { frame, image } = getFrameImagePair(activeObject);
        console.log('[CanvasEditor] sendBackwards - 相框图片组合:', { frame, image });
        
        // 如果是相框-图片组合，使用组移动
        if (frame && image) {
          console.log('[CanvasEditor] sendBackwards - 使用组移动向后移动相框图片组合');
          moveGroupBackward(frame, image);
        } else {
          // 单独对象的处理
          console.log('[CanvasEditor] sendBackwards - 移动单独对象');
          canvasInstance.current.sendBackwards(activeObject);
          canvasInstance.current.renderAll();
        }
        
        // 确保操作后对象可以被选择
        if (!activeObject.selectable) {
          activeObject.set({ selectable: true, evented: true });
        }
        
        // 设置为活动对象以便用户看到操作结果
        canvasInstance.current.setActiveObject(activeObject);
        canvasInstance.current.renderAll();
      } else {
        console.log('[CanvasEditor] sendBackwards - 没有找到可操作的对象');
      }
    },
    bringToFront: () => {
      if (!canvasInstance.current) return;
      
      // 先尝试重建配对，确保最新的配对关系
      rebuildFrameImagePairs();
      
      let activeObject = canvasInstance.current.getActiveObject();
      console.log('[CanvasEditor] bringToFront - 选中对象:', activeObject);
      
      // 如果没有活动对象，尝试智能选择可操作的对象
      if (!activeObject) {
        activeObject = findOperableObject();
        if (activeObject) {
          console.log('[CanvasEditor] bringToFront - 智能选择对象:', activeObject);
        }
      }
      
      if (activeObject) {
        const { frame, image } = getFrameImagePair(activeObject);
        console.log('[CanvasEditor] bringToFront - 相框图片组合:', { frame, image });
        
        // 如果是相框-图片组合，使用组移动
        if (frame && image) {
          console.log('[CanvasEditor] bringToFront - 使用组移动移动相框图片组合到最前');
          moveGroupToFront(frame, image);
        } else {
          // 单独对象的处理
          console.log('[CanvasEditor] bringToFront - 移动单独对象到最前');
          canvasInstance.current.bringToFront(activeObject);
          canvasInstance.current.renderAll();
        }
        
        // 确保操作后对象可以被选择
        if (!activeObject.selectable) {
          activeObject.set({ selectable: true, evented: true });
        }
        
        // 设置为活动对象以便用户看到操作结果
        canvasInstance.current.setActiveObject(activeObject);
        canvasInstance.current.renderAll();
      } else {
        console.log('[CanvasEditor] bringToFront - 没有找到可操作的对象');
      }
    },
    sendToBack: () => {
      if (!canvasInstance.current) return;
      
      // 先尝试重建配对，确保最新的配对关系
      rebuildFrameImagePairs();
      
      let activeObject = canvasInstance.current.getActiveObject();
      console.log('[CanvasEditor] sendToBack - 选中对象:', activeObject);
      
      // 如果没有活动对象，尝试智能选择可操作的对象
      if (!activeObject) {
        activeObject = findOperableObject();
        if (activeObject) {
          console.log('[CanvasEditor] sendToBack - 智能选择对象:', activeObject);
        }
      }
      
      if (activeObject) {
        const { frame, image } = getFrameImagePair(activeObject);
        console.log('[CanvasEditor] sendToBack - 相框图片组合:', { frame, image });
        
        // 如果是相框-图片组合，使用组移动
        if (frame && image) {
          console.log('[CanvasEditor] sendToBack - 使用组移动移动相框图片组合到最后');
          moveGroupToBack(frame, image);
        } else {
          // 单独对象的处理
          console.log('[CanvasEditor] sendToBack - 移动单独对象到最后');
          canvasInstance.current.sendToBack(activeObject);
          canvasInstance.current.renderAll();
        }
        
        // 确保操作后对象可以被选择
        if (!activeObject.selectable) {
          activeObject.set({ selectable: true, evented: true });
        }
        
        // 设置为活动对象以便用户看到操作结果
        canvasInstance.current.setActiveObject(activeObject);
        canvasInstance.current.renderAll();
      } else {
        console.log('[CanvasEditor] sendToBack - 没有找到可操作的对象');
      }
    },
    // 性能控制相关方法
    enableLowResolutionMode,
    disableLowResolutionMode,
    getPerformanceInfo: () => ({
      fps: performanceMonitor.currentFps,
      isLowResolution: canvasInstance.current?.getZoom() < 1 || false
    }),
    
    clearCanvas: () => {
      try {
        console.log('[CanvasEditor] 开始清空画布');
        
        if (!canvasInstance.current) {
          console.warn('[CanvasEditor] canvas实例不存在，无法清空');
          return;
        }
        
        // 保存当前状态到历史，以便撤销
        try {
          saveStateToHistory();
        } catch (error) {
          console.warn('[CanvasEditor] 保存历史状态失败:', error);
        }
        
        // 退出编辑模式
        try {
          exitEditMode();
        } catch (error) {
          console.warn('[CanvasEditor] 退出编辑模式失败:', error);
        }
        
        // 清空画布上的所有对象
        try {
          canvasInstance.current.clear();
          console.log('[CanvasEditor] 画布对象已清空');
        } catch (error) {
          console.error('[CanvasEditor] 清空画布对象失败:', error);
          // 如果 clear() 失败，尝试手动移除所有对象
          try {
            const objects = canvasInstance.current.getObjects();
            objects.forEach(obj => canvasInstance.current?.remove(obj));
            console.log('[CanvasEditor] 手动移除所有对象成功');
          } catch (manualError) {
            console.error('[CanvasEditor] 手动移除对象也失败:', manualError);
          }
        }
        
        // 重新设置画布背景色
        try {
          canvasInstance.current.setBackgroundColor('#ffffff', () => {
            try {
              canvasInstance.current?.renderAll();
              console.log('[CanvasEditor] 画布重新渲染完成');
            } catch (renderError) {
              console.error('[CanvasEditor] 画布渲染失败:', renderError);
            }
          });
        } catch (error) {
          console.error('[CanvasEditor] 设置背景色失败:', error);
        }
        
        // 清空选中对象状态
        try {
          setSelectedObject(null);
          props.onSelectionChange?.(null);
        } catch (error) {
          console.warn('[CanvasEditor] 清空选中状态失败:', error);
        }
        
        // 通知对象数量变化
        try {
          notifyObjectCountChange();
        } catch (error) {
          console.warn('[CanvasEditor] 通知对象数量变化失败:', error);
        }
        
        console.log('[CanvasEditor] 画布清空完成');
      } catch (error) {
        console.error('[CanvasEditor] 清空画布时发生未知错误:', error);
      }
    }
  }));

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 p-4">
      <div 
        className="bg-white border-2 border-gray-300 shadow-lg rounded-lg overflow-hidden relative"
        style={{
          width: responsiveSize.width,
          height: responsiveSize.height,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas 
          ref={canvasRef} 
          className="block" 
          onContextMenu={(e) => e.preventDefault()}
        />
        
        {/* 右键菜单 */}
        {contextMenu.visible && (
          <div
            className="absolute bg-white border border-gray-300 rounded-lg shadow-lg py-2 z-50"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              minWidth: '150px'
            }}
            onMouseLeave={hideContextMenu}
          >
            <div
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => handleContextMenuAction('bringForward')}
            >
              上移一层
            </div>
            <div
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => handleContextMenuAction('sendBackwards')}
            >
              下移一层
            </div>
            <div className="border-t border-gray-200 my-1"></div>
            <div
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => handleContextMenuAction('bringToFront')}
            >
              置顶
            </div>
            <div
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => handleContextMenuAction('sendToBack')}
            >
              置底
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

CanvasEditor.displayName = 'CanvasEditor';

export default CanvasEditor;