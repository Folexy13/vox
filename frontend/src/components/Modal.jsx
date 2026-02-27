import React, { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

/**
 * Modal Component
 * A beautiful, animated modal for alerts, confirmations, and messages
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info', // 'info', 'success', 'warning', 'error'
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onCancel,
  children,
}) => {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const icons = {
    info: <Info className="w-8 h-8 text-blue-400" />,
    success: <CheckCircle className="w-8 h-8 text-green-400" />,
    warning: <AlertTriangle className="w-8 h-8 text-yellow-400" />,
    error: <AlertCircle className="w-8 h-8 text-red-400" />,
  };

  const colors = {
    info: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    success: 'from-green-500/20 to-green-600/10 border-green-500/30',
    warning: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
    error: 'from-red-500/20 to-red-600/10 border-red-500/30',
  };

  const buttonColors = {
    info: 'bg-blue-500 hover:bg-blue-600',
    success: 'bg-green-500 hover:bg-green-600',
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    error: 'bg-red-500 hover:bg-red-600',
  };

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  const handleCancel = () => {
    onCancel?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={`
          relative w-full max-w-md
          bg-gradient-to-br ${colors[type]}
          bg-gray-900/95 backdrop-blur-xl
          border rounded-2xl shadow-2xl
          transform animate-scale-in
        `}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full
            text-gray-400 hover:text-white hover:bg-white/10
            transition-colors duration-200"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-white/5">
              {icons[type]}
            </div>
          </div>

          {/* Title */}
          {title && (
            <h3 className="text-xl font-semibold text-white text-center mb-2">
              {title}
            </h3>
          )}

          {/* Message */}
          {message && (
            <p className="text-gray-300 text-center mb-6">
              {message}
            </p>
          )}

          {/* Custom children */}
          {children}

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            {cancelText && (
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-3 rounded-xl
                  bg-white/5 hover:bg-white/10
                  text-gray-300 font-medium
                  transition-colors duration-200"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`
                flex-1 px-4 py-3 rounded-xl
                ${buttonColors[type]}
                text-white font-medium
                transition-colors duration-200
              `}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Modal;
