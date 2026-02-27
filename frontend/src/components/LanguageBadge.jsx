import React from 'react';
import { Languages, Globe } from 'lucide-react';

/**
 * LanguageBadge Component
 * Shows detected language of a speaker with flag/icon
 */
const LanguageBadge = ({ 
  language, 
  variant = 'default', // 'default', 'user', 'partner'
  size = 'md', // 'sm', 'md', 'lg'
  showIcon = true,
  className = ''
}) => {
  // Language display names and flags
  const languageInfo = {
    'en-US': { name: 'English (US)', flag: '🇺🇸', color: 'blue' },
    'en-GB': { name: 'English (UK)', flag: '🇬🇧', color: 'blue' },
    'en-NG': { name: 'English (NG)', flag: '🇳🇬', color: 'green' },
    'fr-FR': { name: 'French', flag: '🇫🇷', color: 'blue' },
    'es-ES': { name: 'Spanish', flag: '🇪🇸', color: 'yellow' },
    'yo-NG': { name: 'Yoruba', flag: '🇳🇬', color: 'green' },
    'ig-NG': { name: 'Igbo', flag: '🇳🇬', color: 'green' },
    'ha-NG': { name: 'Hausa', flag: '🇳🇬', color: 'green' },
    'ar-SA': { name: 'Arabic', flag: '🇸🇦', color: 'green' },
    'zh-CN': { name: 'Mandarin', flag: '🇨🇳', color: 'red' },
    'English': { name: 'English', flag: '🌐', color: 'blue' },
    'French': { name: 'French', flag: '🇫🇷', color: 'blue' },
    'Spanish': { name: 'Spanish', flag: '🇪🇸', color: 'yellow' },
    'Yoruba': { name: 'Yoruba', flag: '🇳🇬', color: 'green' },
    'Igbo': { name: 'Igbo', flag: '🇳🇬', color: 'green' },
    'Hausa': { name: 'Hausa', flag: '🇳🇬', color: 'green' },
  };

  const info = languageInfo[language] || { 
    name: language || 'Detecting...', 
    flag: '🌐', 
    color: 'gray' 
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  // Variant colors
  const variantClasses = {
    default: 'bg-white/10 border-white/20 text-white',
    user: 'bg-google-blue/20 border-google-blue/30 text-blue-300',
    partner: 'bg-google-red/20 border-google-red/30 text-rose-300',
  };

  // Icon size
  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  return (
    <div 
      className={`
        inline-flex items-center gap-2 rounded-full border backdrop-blur-md
        font-medium transition-all duration-300
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {showIcon && (
        <span className="text-base">{info.flag}</span>
      )}
      <span>{info.name}</span>
    </div>
  );
};

export default LanguageBadge;
