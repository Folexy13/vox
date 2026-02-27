import React from 'react';

/**
 * LoadingSpinner Component
 * A beautiful animated loading spinner with optional message
 */
const LoadingSpinner = ({
  size = 'md', // 'sm', 'md', 'lg', 'xl'
  message,
  subMessage,
  fullScreen = false,
  className = '',
}) => {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {/* Spinner */}
      <div className="relative">
        {/* Outer ring */}
        <div 
          className={`
            ${sizes[size]} rounded-full
            border-4 border-white/10
          `}
        />
        
        {/* Spinning gradient ring */}
        <div 
          className={`
            absolute inset-0 ${sizes[size]} rounded-full
            border-4 border-transparent
            border-t-google-blue border-r-google-red
            border-b-google-yellow border-l-google-green
            animate-spin
          `}
          style={{ animationDuration: '1s' }}
        />
        
        {/* Inner glow */}
        <div 
          className={`
            absolute inset-2 rounded-full
            bg-gradient-to-br from-google-blue/20 to-google-red/20
            animate-pulse
          `}
        />
      </div>

      {/* Message */}
      {message && (
        <div className="text-center">
          <p className={`text-white font-medium ${textSizes[size]}`}>
            {message}
          </p>
          {subMessage && (
            <p className="text-gray-400 text-sm mt-1">
              {subMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
};

/**
 * LoadingOverlay Component
 * A loading overlay that covers its parent container
 */
export const LoadingOverlay = ({
  isLoading,
  message,
  subMessage,
  children,
}) => {
  return (
    <div className="relative">
      {children}
      
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm rounded-xl">
          <LoadingSpinner 
            size="lg" 
            message={message}
            subMessage={subMessage}
          />
        </div>
      )}
    </div>
  );
};

/**
 * ProcessingIndicator Component
 * Shows a processing state with animated dots
 */
export const ProcessingIndicator = ({
  message = 'Processing',
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-white">{message}</span>
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-google-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-google-red rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-google-yellow rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
};

export default LoadingSpinner;
