import React, { useState, useEffect } from 'react';
import { templatesAPI } from '../api';
import { Template } from '../api/index';

interface CategoryTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateSelect: (template: Template) => void;
  category: string;
  categoryName: string;
}

const CategoryTemplatesModal: React.FC<CategoryTemplatesModalProps> = ({
  isOpen,
  onClose,
  onTemplateSelect,
  category,
  categoryName
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAllTemplates();
    }
  }, [isOpen, category]);

  const fetchAllTemplates = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: 1,
        pageSize: 100, // 获取所有模板
        category: category === 'all' ? undefined : category,
      };

      if (params.category === undefined) {
        delete params.category;
      }

      const response = await templatesAPI.getAll(params);
      if (Array.isArray(response)) {
        setTemplates(response);
      } else {
        setTemplates(response.data || []);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template: Template) => {
    onTemplateSelect(template);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {categoryName} - 所有模板
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-600">加载中...</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-4 text-gray-500">该分类下暂无模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-96 overflow-y-auto">
              {templates.map(template => (
                <div
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-pointer"
                >
                  {/* 模板图片 */}
                  <div className="aspect-square bg-gray-50 overflow-hidden">
                    <img
                      src={`http://localhost:3001${template.image_path}`}
                      alt={template.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  </div>
                  
                  {/* 模板信息 */}
                  <div className="p-2">
                    <h4 className="text-xs font-medium text-gray-900 truncate" title={template.name}>
                      {template.name}
                    </h4>
                  </div>

                  {/* 悬停效果 */}
                  <div className="absolute inset-0 bg-blue-500 bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="bg-white rounded-full p-2 shadow-lg">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 text-center">
            💡 点击模板即可应用到画布
          </p>
        </div>
      </div>
    </div>
  );
};

export default CategoryTemplatesModal;