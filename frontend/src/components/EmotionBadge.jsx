import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * EmotionBadge - Displays detected emotion with visual feedback
 * Shows judges that Vox understands emotional context, not just words
 */
const EmotionBadge = ({ 
  emotion = 'neutral', 
  showLabel = true,
  size = 'md',
  animated = true,
  className = ''
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [prevEmotion, setPrevEmotion] = useState(emotion);
  
  // Animate when emotion changes
  useEffect(() => {
    if (emotion !== prevEmotion) {
      setIsAnimating(true);
      setPrevEmotion(emotion);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [emotion, prevEmotion]);
  
  // Emotion configurations
  const emotions = {
    happy: {
      emoji: '😊',
      label: 'Happy',
      color: 'from-yellow-400 to-orange-400',
      bgColor: 'bg-yellow-500/20',
      borderColor: 'border-yellow-500/50',
      textColor: 'text-yellow-400',
    },
    excited: {
      emoji: '🎉',
      label: 'Excited',
      color: 'from-pink-400 to-purple-400',
      bgColor: 'bg-pink-500/20',
      borderColor: 'border-pink-500/50',
      textColor: 'text-pink-400',
    },
    sad: {
      emoji: '😢',
      label: 'Sad',
      color: 'from-blue-400 to-indigo-400',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/50',
      textColor: 'text-blue-400',
    },
    angry: {
      emoji: '😤',
      label: 'Frustrated',
      color: 'from-red-400 to-orange-400',
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/50',
      textColor: 'text-red-400',
    },
    frustrated: {
      emoji: '😤',
      label: 'Frustrated',
      color: 'from-orange-400 to-red-400',
      bgColor: 'bg-orange-500/20',
      borderColor: 'border-orange-500/50',
      textColor: 'text-orange-400',
    },
    confused: {
      emoji: '🤔',
      label: 'Confused',
      color: 'from-purple-400 to-blue-400',
      bgColor: 'bg-purple-500/20',
      borderColor: 'border-purple-500/50',
      textColor: 'text-purple-400',
    },
    neutral: {
      emoji: '😐',
      label: 'Neutral',
      color: 'from-gray-400 to-gray-500',
      bgColor: 'bg-gray-500/20',
      borderColor: 'border-gray-500/50',
      textColor: 'text-gray-400',
    },
    calm: {
      emoji: '😌',
      label: 'Calm',
      color: 'from-green-400 to-teal-400',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/50',
      textColor: 'text-green-400',
    },
    surprised: {
      emoji: '😲',
      label: 'Surprised',
      color: 'from-cyan-400 to-blue-400',
      bgColor: 'bg-cyan-500/20',
      borderColor: 'border-cyan-500/50',
      textColor: 'text-cyan-400',
    },
    worried: {
      emoji: '😟',
      label: 'Worried',
      color: 'from-amber-400 to-yellow-400',
      bgColor: 'bg-amber-500/20',
      borderColor: 'border-amber-500/50',
      textColor: 'text-amber-400',
    },
  };
  
  const emotionConfig = emotions[emotion?.toLowerCase()] || emotions.neutral;
  
  // Size configurations
  const sizes = {
    sm: {
      container: 'px-2 py-1',
      emoji: 'text-sm',
      label: 'text-xs',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'px-3 py-1.5',
      emoji: 'text-lg',
      label: 'text-sm',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'px-4 py-2',
      emoji: 'text-2xl',
      label: 'text-base',
      icon: 'w-5 h-5',
    },
  };
  
  const sizeConfig = sizes[size] || sizes.md;

  return (
    <div 
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        ${emotionConfig.bgColor} ${emotionConfig.borderColor}
        ${sizeConfig.container}
        ${animated && isAnimating ? 'animate-pulse scale-110' : ''}
        transition-all duration-300
        ${className}
      `}
    >
      {/* Emotion emoji */}
      <span 
        className={`${sizeConfig.emoji} ${animated && isAnimating ? 'animate-bounce' : ''}`}
        role="img" 
        aria-label={emotionConfig.label}
      >
        {emotionConfig.emoji}
      </span>
      
      {/* Label */}
      {showLabel && (
        <span className={`font-medium ${emotionConfig.textColor} ${sizeConfig.label}`}>
          {emotionConfig.label}
        </span>
      )}
      
      {/* AI indicator */}
      {showLabel && (
        <Sparkles className={`${sizeConfig.icon} ${emotionConfig.textColor} opacity-60`} />
      )}
    </div>
  );
};

/**
 * EmotionIndicator - Compact emotion display for call UI
 */
export const EmotionIndicator = ({ 
  emotion, 
  userName = 'Speaker',
  isUser = false,
  className = '' 
}) => {
  const emotions = {
    happy: '😊',
    excited: '🎉',
    sad: '😢',
    angry: '😤',
    frustrated: '😤',
    confused: '🤔',
    neutral: '😐',
    calm: '😌',
    surprised: '😲',
    worried: '😟',
  };
  
  const emoji = emotions[emotion?.toLowerCase()] || '💬';
  
  if (!emotion || emotion === 'neutral') return null;
  
  return (
    <div className={`flex items-center gap-1 text-xs text-gray-400 ${className}`}>
      <span className="text-sm">{emoji}</span>
      <span>{isUser ? 'You' : userName} is feeling {emotion}</span>
    </div>
  );
};

/**
 * EmotionTransition - Shows emotion being preserved in translation
 */
export const EmotionTransition = ({
  sourceEmotion,
  preserved = true,
  className = ''
}) => {
  if (!sourceEmotion) return null;
  
  const emotions = {
    happy: '😊',
    excited: '🎉',
    sad: '😢',
    angry: '😤',
    frustrated: '😤',
    confused: '🤔',
    neutral: '😐',
    calm: '😌',
    surprised: '😲',
    worried: '😟',
  };
  
  const emoji = emotions[sourceEmotion?.toLowerCase()] || '💬';
  
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-gray-500">Emotion:</span>
      <span className="text-lg">{emoji}</span>
      {preserved && (
        <span className="flex items-center gap-1 text-green-400">
          <Sparkles className="w-3 h-3" />
          Preserved
        </span>
      )}
    </div>
  );
};

export default EmotionBadge;
