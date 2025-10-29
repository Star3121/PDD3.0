import React from 'react';

interface BatchError {
  orderNumber: string;
  error: string;
}

interface BatchErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  successCount: number;
  failureCount: number;
  errors: BatchError[];
}

const BatchErrorModal: React.FC<BatchErrorModalProps> = ({
  isOpen,
  onClose,
  successCount,
  failureCount,
  errors
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center mb-4">
            <div className="bg-yellow-100 rounded-full p-2 mr-3">
              <span className="text-2xl">⚠️</span>
            </div>
            <h3 className="text-lg font-bold text-gray-800">
              批量保存结果
            </h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <span className="text-green-600 text-xl mr-2">✅</span>
                <div>
                  <div className="text-green-800 font-semibold">成功保存</div>
                  <div className="text-green-600 text-2xl font-bold">{successCount}</div>
                </div>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <span className="text-red-600 text-xl mr-2">❌</span>
                <div>
                  <div className="text-red-800 font-semibold">保存失败</div>
                  <div className="text-red-600 text-2xl font-bold">{failureCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {errors.length > 0 && (
          <div className="p-6 max-h-96 overflow-y-auto">
            <h4 className="text-md font-semibold text-gray-800 mb-3">失败详情：</h4>
            <div className="space-y-3">
              {errors.map((error, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <span className="text-red-500 text-lg mr-2 mt-0.5">🚫</span>
                    <div className="flex-1">
                      <div className="font-semibold text-red-800 mb-1">
                        订单号：{error.orderNumber}
                      </div>
                      <div className="text-red-600 text-sm">
                        {error.error}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchErrorModal;