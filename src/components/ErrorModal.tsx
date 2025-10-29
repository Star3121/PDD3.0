import React from 'react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'error' | 'warning' | 'info';
  onConfirm?: () => void;
  confirmText?: string;
  showConfirm?: boolean;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'error',
  onConfirm,
  confirmText = '确定',
  showConfirm = false
}) => {
  if (!isOpen) return null;

  const getIconAndColor = () => {
    switch (type) {
      case 'error':
        return {
          icon: '❌',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          iconBg: 'bg-red-100',
          textColor: 'text-red-800',
          buttonColor: 'bg-red-600 hover:bg-red-700'
        };
      case 'warning':
        return {
          icon: '⚠️',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          iconBg: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          buttonColor: 'bg-yellow-600 hover:bg-yellow-700'
        };
      case 'info':
        return {
          icon: 'ℹ️',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          iconBg: 'bg-blue-100',
          textColor: 'text-blue-800',
          buttonColor: 'bg-blue-600 hover:bg-blue-700'
        };
      default:
        return {
          icon: '❌',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          iconBg: 'bg-red-100',
          textColor: 'text-red-800',
          buttonColor: 'bg-red-600 hover:bg-red-700'
        };
    }
  };

  const { icon, bgColor, borderColor, iconBg, textColor, buttonColor } = getIconAndColor();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${bgColor} ${borderColor} border-2 rounded-lg shadow-2xl max-w-md w-full mx-4 animate-pulse`}>
        <div className="p-6">
          <div className="flex items-center mb-4">
            <div className={`${iconBg} rounded-full p-2 mr-3 text-2xl`}>
              {icon}
            </div>
            <h3 className={`text-lg font-bold ${textColor}`}>
              {title}
            </h3>
          </div>
          
          <div className={`${textColor} mb-6 whitespace-pre-line leading-relaxed`}>
            {message}
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              取消
            </button>
            {showConfirm && (
              <button
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
                className={`px-4 py-2 text-white rounded transition-colors ${buttonColor}`}
              >
                {confirmText}
              </button>
            )}
            {!showConfirm && (
              <button
                onClick={onClose}
                className={`px-4 py-2 text-white rounded transition-colors ${buttonColor}`}
              >
                确定
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;