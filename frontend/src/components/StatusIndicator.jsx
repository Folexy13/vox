import React, { useState, useEffect } from 'react';
import { Sparkles, Mic, Languages, AlertCircle, Loader2, Volume2, WifiOff, RefreshCw } from 'lucide-react';

/**
 * StatusIndicator Component
 * Shows real-time status of Vox processing
 * Visual proof for judges that interruption handling is working
 */
const StatusIndicator = ({ status, partnerStatus, emotion, partnerEmotion, listeningToName, className = '' }) => {
  const [isFlashing, setIsFlashing] = useState(false);
  
  // Flash animation for interruption
  useEffect(() => {
    if (status === 'interrupted') {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const getStatusConfig = (currentStatus) => {
    switch (currentStatus) {
      case 'connecting':
        return {
          icon: Loader2,
          text: 'Connecting...',
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/20',
          borderColor: 'border-gray-500/30',
          animate: 'animate-spin',
        };
        
      case 'connected':
        return {
          icon: Loader2,
          text: 'Initializing agent...',
          color: 'text-google-yellow',
          bgColor: 'bg-google-yellow/20',
          borderColor: 'border-google-yellow/30',
          animate: 'animate-spin',
        };
        
      case 'listening':
        return {
          icon: Mic,
          text: listeningToName ? `Vox is listening to ${listeningToName}` : 'Vox is listening',
          color: 'text-google-blue',
          bgColor: 'bg-google-blue/20',
          borderColor: 'border-google-blue/30',
          animate: 'animate-pulse',
        };
        
      case 'processing':
        return {
          icon: Loader2,
          text: 'Processing...',
          color: 'text-google-yellow',
          bgColor: 'bg-google-yellow/20',
          borderColor: 'border-google-yellow/30',
          animate: 'animate-spin',
        };
        
      case 'reshaping_accent':
        return {
          icon: Volume2,
          text: 'Reshaping accent',
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/20',
          borderColor: 'border-purple-500/30',
          animate: 'animate-pulse',
        };
        
      case 'translating':
        return {
          icon: Languages,
          text: 'Translating',
          color: 'text-google-green',
          bgColor: 'bg-google-green/20',
          borderColor: 'border-google-green/30',
          animate: 'animate-pulse',
        };
        
      case 'crosstalk':
        return {
          icon: Sparkles,
          text: 'Listening to both',
          color: 'text-orange-400',
          bgColor: 'bg-orange-500/20',
          borderColor: 'border-orange-500/30',
          animate: 'animate-bounce',
        };
        
      case 'interrupted':
        return {
          icon: AlertCircle,
          text: 'Interrupted',
          color: 'text-google-red',
          bgColor: 'bg-google-red/20',
          borderColor: 'border-google-red/30',
          animate: '',
        };
        
      case 'active':
        return {
          icon: Sparkles,
          text: 'Vox Active',
          color: 'text-google-blue',
          bgColor: 'bg-google-blue/20',
          borderColor: 'border-google-blue/30',
          animate: '',
        };
        
      case 'waiting':
        return {
          icon: Loader2,
          text: 'Waiting for partner...',
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/20',
          borderColor: 'border-gray-500/30',
          animate: 'animate-spin',
        };
        
      case 'reconnecting':
        return {
          icon: RefreshCw,
          text: 'Reconnecting...',
          color: 'text-google-yellow',
          bgColor: 'bg-google-yellow/20',
          borderColor: 'border-google-yellow/30',
          animate: 'animate-spin',
        };
        
      case 'error':
        return {
          icon: WifiOff,
          text: 'Connection failed',
          color: 'text-google-red',
          bgColor: 'bg-google-red/20',
          borderColor: 'border-google-red/30',
          animate: '',
        };
        
      case 'disconnected':
        return {
          icon: WifiOff,
          text: 'Disconnected',
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/20',
          borderColor: 'border-gray-500/30',
          animate: '',
        };
        
      default:
        return {
          icon: Mic,
          text: 'Ready',
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/20',
          borderColor: 'border-gray-500/30',
          animate: '',
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <div 
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-full
        ${config.bgColor} ${config.borderColor} border
        backdrop-blur-md transition-all duration-300
        ${isFlashing ? 'animate-ping' : ''}
        ${className}
      `}
    >
      <Icon className={`w-4 h-4 ${config.color} ${config.animate}`} />
      <span className={`text-sm font-medium ${config.color}`}>
        {config.text}
      </span>
      
      {/* Emotion indicator */}
      {emotion && emotion !== 'neutral' && (
        <div className="ml-2 pl-2 border-l border-white/10 flex items-center gap-1">
          <span className="text-sm" title={`Detected emotion: ${emotion}`}>
            {getEmotionEmoji(emotion)}
          </span>
          <span className="text-xs text-gray-400 hidden sm:inline">
            {emotion}
          </span>
        </div>
      )}
      
      {/* Partner status indicator */}
      {partnerStatus && partnerStatus !== 'idle' && (
        <div className="ml-2 pl-2 border-l border-white/10 flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-google-green animate-pulse" />
          <span className="text-xs text-gray-400">
            Partner {partnerStatus === 'translating' ? 'speaking' : partnerStatus}
          </span>
          {partnerEmotion && partnerEmotion !== 'neutral' && (
            <span className="text-sm ml-1" title={`Partner emotion: ${partnerEmotion}`}>
              {getEmotionEmoji(partnerEmotion)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Helper function to get emoji for emotion
const getEmotionEmoji = (emotion) => {
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
  return emotions[emotion?.toLowerCase()] || '💬';
};

export default StatusIndicator;
