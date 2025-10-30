import React, { useState, useEffect } from 'react';
import { templatesAPI, categoriesAPI } from '../api';
import { Template, Category } from '../api/index';
import { buildImageUrl } from '../lib/utils';

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateSelect: (template: Template) => void;
}

const TemplateSelectionModal: React.FC<TemplateSelectionModalProps> = ({
  isOpen,
  onClose,
  onTemplateSelect
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response);
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  const getCategoryDisplayName = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.display_name : categoryName;
  };

  const fetchTemplates = async () => {
    if (!isOpen) return;
    
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        limit: 24, // 每页显示24个模板 (6列 x 4行)
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }

      const response = await templatesAPI.getAll(params);
      
      // 处理可能的分页响应或直接数组响应
      if (Array.isArray(response)) {
        setTemplates(response);
        setTotalPages(1);
      } else {
        setTemplates(response.data || []);
        setTotalPages(response.pagination?.totalPages || 1);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchTemplates();
    }
  }, [isOpen, currentPage, searchQuery, selectedCategory]);

  const handleTemplateClick = (template: Template) => {
    onTemplateSelect(template);
    onClose();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // 重置到第一页
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
    setCurrentPage(1); // 重置到第一页
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-11/12 h-5/6 max-w-6xl flex flex-col">
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">选择模板</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 搜索和筛选 */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="搜索模板..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-48">
              <select
                value={selectedCategory}
                onChange={handleCategoryChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">全部分类</option>
                {categories.map(category => (
                  <option key={category.id} value={category.name}>
                    {category.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 模板网格 */}
        <div className="flex-1 p-4 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">暂无模板</div>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              {templates.map(template => (
                <div
                  key={template.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleTemplateClick(template)}
                >
                  <div className="aspect-square overflow-hidden rounded-t-lg">
                    <img
                      src={buildImageUrl(template.image_path)}
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <h3 className="font-medium text-gray-900 text-xs truncate" title={template.name}>
                      {template.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {getCategoryDisplayName(template.category)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                上一页
              </button>
              <span className="text-sm text-gray-600">
                第 {currentPage} 页，共 {totalPages} 页
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateSelectionModal;