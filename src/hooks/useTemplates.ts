import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { templatesAPI, categoriesAPI } from '../api';
import { Template, Category, PaginatedResponse } from '../api';

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
});

interface UseTemplatesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  enabled?: boolean;
}

interface UseTemplatesResult {
  templates: Template[];
  categories: Category[];
  loading: boolean;
  total: number;
  totalPages: number;
  refresh: () => void;
}

export function useTemplates({ 
  page = 1, 
  pageSize = 20, 
  search = '', 
  category = 'all',
  enabled = true 
}: UseTemplatesParams = {}): UseTemplatesResult {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // 获取静态数据（优先使用）
  const { data: staticData, mutate: mutateStatic } = useSWR('/data/templates.json', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    onError: () => console.log('Static data not found, falling back to API')
  });

  // 获取分类数据（如果静态数据中没有）
  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response);
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  useEffect(() => {
    if (staticData?.categories) {
      setCategories(staticData.categories);
    } else {
      fetchCategories();
    }
  }, [staticData]);

  const fetchTemplates = async () => {
    if (!enabled) return;
    
    setLoading(true);
    try {
      // 优先使用静态数据进行客户端筛选
      if (staticData && staticData.templates) {
        let result = staticData.templates;
        
        // 筛选
        if (search && search.trim()) {
            const lowerQuery = search.trim().toLowerCase();
            result = result.filter((t: Template) => t.name.toLowerCase().includes(lowerQuery));
        }
        if (category && category !== 'all') {
            result = result.filter((t: Template) => t.category === category);
        }
        
        // 分页
        const currentTotal = result.length;
        setTotal(currentTotal);
        setTotalPages(Math.ceil(currentTotal / pageSize));
        
        const start = (page - 1) * pageSize;
        setTemplates(result.slice(start, start + pageSize));
        setLoading(false);
        return;
      }

      // 降级到 API
      const params = {
        page,
        pageSize,
        search: search?.trim(),
        category: category === 'all' ? undefined : category,
      };
      
      const response = await templatesAPI.getAll(params);
      
      if ('data' in response) {
        setTemplates(response.data);
        setTotal(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
      } else {
        setTemplates(response);
        setTotal(response.length);
        setTotalPages(Math.ceil(response.length / pageSize));
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [page, pageSize, search, category, staticData, enabled]);

  return {
    templates,
    categories,
    loading,
    total,
    totalPages,
    refresh: () => {
        mutateStatic();
        fetchTemplates();
    }
  };
}
