import React, { useState, useEffect } from 'react';
import { templatesAPI, categoriesAPI } from '../api';
import { Template, PaginatedResponse, Category } from '../api';
import Pagination from './Pagination';
import { buildImageUrl } from '../lib/utils';

interface TemplateLibraryProps {
  onTemplateSelect: (template: Template) => void;
  onTemplateUpload?: () => void;
}

const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ 
  onTemplateSelect, 
  onTemplateUpload 
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('default');
  const [uploading, setUploading] = useState(false);
  
  // 分类相关状态
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDisplayName, setNewCategoryDisplayName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [editingTemplateCategory, setEditingTemplateCategory] = useState('');
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
  }, []);

  // 监听分页参数变化
  useEffect(() => {
    fetchTemplates();
  }, [currentPage, pageSize, searchQuery, selectedCategory]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        pageSize,
        search: searchQuery.trim(),
        category: selectedCategory === 'all' ? undefined : selectedCategory,
      };
      
      const response = await templatesAPI.getAll(params);
      
      if ('data' in response) {
        // 新的分页API响应格式
        setTemplates(response.data);
        setTotal(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
      } else {
        // 兼容旧的API响应格式
        setTemplates(response);
        setTotal(response.length);
        setTotalPages(Math.ceil(response.length / pageSize));
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      alert('获取模板失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) {
      alert('请选择图片文件');
      return;
    }
    setUploadFiles(images);
    if (!uploadName && images.length === 1) {
      setUploadName(images[0].name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      alert('请至少选择一张图片');
      return;
    }

    try {
      setUploading(true);
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const name = uploadFiles.length === 1 ? uploadName || file.name.replace(/\.[^/.]+$/, '') : file.name.replace(/\.[^/.]+$/, '');
        await templatesAPI.create(file, { name, category: uploadCategory });
      }
      alert('模板上传成功');
      setUploadModalOpen(false);
      setUploadFiles([]);
      setUploadName('');
      setUploadCategory('default');
      fetchTemplates();
      if (onTemplateUpload) onTemplateUpload();
    } catch (error) {
      console.error('模板上传失败:', error);
      alert('模板上传失败，请稍后重试');
    } finally {
      setUploading(false);
    }
  };

  const handleSelectTemplate = (templateId: number) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTemplates.size === templates.length) {
      // 如果已全选，则取消全选
      setSelectedTemplates(new Set());
    } else {
      // 否则全选当前页的模板
      const allIds = new Set(templates.map(template => template.id));
      setSelectedTemplates(allIds);
    }
  };

  // 分页处理函数
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedTemplates(new Set()); // 切换页面时清空选择
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // 重置到第一页
    setSelectedTemplates(new Set()); // 清空选择
  };

  // 搜索处理函数
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // 重置到第一页
    setSelectedTemplates(new Set()); // 清空选择
  };

  // 分类筛选处理函数
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1); // 重置到第一页
    setSelectedTemplates(new Set()); // 清空选择
  };

  const handleBatchDelete = async () => {
    if (selectedTemplates.size === 0) return;
    
    if (window.confirm(`确定要删除选中的 ${selectedTemplates.size} 个模板吗？此操作不可撤销。`)) {
      try {
        // 使用批量删除API
        const templateIds = Array.from(selectedTemplates);
        const result = await templatesAPI.batchDelete(templateIds);
        
        // 重新获取模板列表
        await fetchTemplates();
        
        // 清空选择
        setSelectedTemplates(new Set());
        
        alert(result.message);
      } catch (error) {
        console.error('批量删除失败:', error);
        alert('批量删除失败，请重试');
      }
    }
  };

  const deleteTemplate = async (templateId: number) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await templatesAPI.delete(templateId);
      setTemplates(templates.filter(t => t.id !== templateId));
      // 如果删除的模板在选中列表中，也要移除
      if (selectedTemplates.has(templateId)) {
        const newSelected = new Set(selectedTemplates);
        newSelected.delete(templateId);
        setSelectedTemplates(newSelected);
      }
      alert('模板删除成功');
    } catch (error) {
      console.error('删除模板失败:', error);
      alert('删除模板失败，请稍后重试');
    }
  };

  // 获取分类数据
  const fetchCategories = async () => {
    try {
      const categoriesData = await categoriesAPI.getAll();
      setCategories(categoriesData);
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  // 获取分类显示名称
  const getCategoryDisplayName = (categoryName: string) => {
    if (categoryName === 'all') return '全部';
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.display_name : categoryName;
  };

  // 分类管理功能
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !newCategoryDisplayName.trim()) {
      alert('请输入分类名称和显示名称');
      return;
    }

    try {
      await categoriesAPI.create({
        name: newCategoryName.trim(),
        display_name: newCategoryDisplayName.trim(),
        description: '',
        sort_order: categories.length
      });
      
      setNewCategoryName('');
      setNewCategoryDisplayName('');
      setCategoryModalOpen(false);
      fetchCategories();
      alert('分类创建成功');
    } catch (error) {
      console.error('创建分类失败:', error);
      alert('创建分类失败，请稍后重试');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !newCategoryDisplayName.trim()) {
      alert('请输入显示名称');
      return;
    }

    try {
      await categoriesAPI.update(editingCategory.id, {
        display_name: newCategoryDisplayName.trim(),
        description: editingCategory.description,
        sort_order: editingCategory.sort_order
      });
      
      setEditingCategory(null);
      setNewCategoryDisplayName('');
      fetchCategories();
      alert('分类更新成功');
    } catch (error) {
      console.error('更新分类失败:', error);
      alert('更新分类失败，请稍后重试');
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;

    if (category.is_default) {
      alert('默认分类不能删除');
      return;
    }

    const confirmDelete = window.confirm(
      `确定要删除分类"${category.display_name}"吗？\n\n注意：删除分类后，该分类下的所有模板将被移动到"默认"分类。`
    );

    if (!confirmDelete) return;

    try {
      await categoriesAPI.delete(categoryId);
      fetchCategories();
      fetchTemplates(); // 重新获取模板数据
      alert('分类删除成功');
    } catch (error) {
      console.error('删除分类失败:', error);
      alert('删除分类失败，请稍后重试');
    }
  };

  const startEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryDisplayName(category.display_name);
    setCategoryModalOpen(true);
  };

  // 模板编辑功能
  const startEditTemplate = (template: Template) => {
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
    setEditingTemplateCategory(template.category);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplateId || !editingTemplateName.trim()) {
      alert('请输入模板名称');
      return;
    }

    try {
      await templatesAPI.update(editingTemplateId, {
        name: editingTemplateName.trim(),
        category: editingTemplateCategory
      });
      
      setEditingTemplateId(null);
      setEditingTemplateName('');
      setEditingTemplateCategory('');
      fetchTemplates();
      alert('模板更新成功');
    } catch (error) {
      console.error('更新模板失败:', error);
      alert('更新模板失败，请稍后重试');
    }
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setEditingTemplateName('');
    setEditingTemplateCategory('');
  };

  // 现在过滤在后端完成，直接使用 templates
  const filteredTemplates = templates;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">模板库</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索模板名称"
            className="w-48 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          {filteredTemplates.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm flex items-center gap-1 border border-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {selectedTemplates.size === filteredTemplates.length ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
              {selectedTemplates.size === filteredTemplates.length ? '取消全选' : '全选'}
            </button>
          )}
          {selectedTemplates.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              批量删除 ({selectedTemplates.size})
            </button>
          )}
          <button
            onClick={() => setUploadModalOpen(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            批量上传
          </button>
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-2 mb-4 overflow-x-auto items-center">
        <button
          key="all"
          onClick={() => handleCategoryChange('all')}
          className={`px-3 py-1 rounded text-sm whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          全部
        </button>
        {categories.map(category => (
          <div key={category.id} className="flex items-center gap-1">
            <button
              onClick={() => handleCategoryChange(category.name)}
              className={`px-3 py-1 rounded text-sm whitespace-nowrap ${
                selectedCategory === category.name
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category.display_name}
            </button>
            <button
              onClick={() => startEditCategory(category)}
              className="text-gray-400 hover:text-blue-500 p-1"
              title="编辑分类"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {!category.is_default && (
              <button
                onClick={() => handleDeleteCategory(category.id)}
                className="text-gray-400 hover:text-red-500 p-1"
                title="删除分类"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => {
            setEditingCategory(null);
            setNewCategoryName('');
            setNewCategoryDisplayName('');
            setCategoryModalOpen(true);
          }}
          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1 whitespace-nowrap"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加分类
        </button>
      </div>

      {/* 模板网格 */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>暂无模板</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-96 overflow-y-auto">
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              className={`relative group border rounded-lg overflow-hidden hover:shadow-md transition-all aspect-[3/4] ${
                selectedTemplates.has(template.id) 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200'
              }`}
            >
              {/* 复选框 */}
              <div className="absolute top-2 left-2 z-10">
                <input
                  type="checkbox"
                  checked={selectedTemplates.has(template.id)}
                  onChange={() => handleSelectTemplate(template.id)}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              
              <img
                src={buildImageUrl(template.image_path)}
                alt={template.name}
                className="w-full h-2/3 object-cover cursor-pointer"
                onClick={() => onTemplateSelect(template)}
              />
              <div className="p-2 h-1/3 flex flex-col justify-between">
                {editingTemplateId === template.id ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={editingTemplateName}
                      onChange={(e) => setEditingTemplateName(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded px-1 py-0.5"
                      onBlur={handleUpdateTemplate}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateTemplate();
                        if (e.key === 'Escape') cancelEditTemplate();
                      }}
                      autoFocus
                    />
                    <select
                      value={editingTemplateCategory}
                      onChange={(e) => setEditingTemplateCategory(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-1 py-0.5"
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.name}>
                          {category.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div onDoubleClick={() => startEditTemplate(template)}>
                    <p className="text-sm font-medium text-gray-900 truncate" title={template.name}>
                      {template.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {getCategoryDisplayName(template.category)}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTemplate(template.id);
                }}
                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

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
          />
        </div>
      )}

      {/* 上传模态框 */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">批量上传模板</h3>
            
            <div className="space-y-4">
              {uploadFiles.length <= 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">模板名称（单文件时可编辑）</label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入模板名称"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map(category => (
                    <option key={category.id} value={category.name}>
                      {category.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择图片（可多选）</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {uploadFiles.length > 1 && (
                  <p className="mt-1 text-xs text-gray-500">已选择 {uploadFiles.length} 张图片，名称将自动使用文件名。</p>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                disabled={uploading}
              >
                取消
              </button>
              <button
                onClick={handleUpload}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                disabled={uploading}
              >
                {uploading ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分类管理模态框 */}
      {categoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingCategory ? '编辑分类' : '添加分类'}
            </h3>
            <div className="space-y-4">
              {!editingCategory && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分类标识</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入分类标识（英文，如：custom）"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                <input
                  type="text"
                  value={newCategoryDisplayName}
                  onChange={(e) => setNewCategoryDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入显示名称（如：自定义）"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setCategoryModalOpen(false);
                  setEditingCategory(null);
                  setNewCategoryName('');
                  setNewCategoryDisplayName('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingCategory ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateLibrary;