import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, ChevronDown, ChevronUp, 
  Languages, Clock, Sparkles, X,
  Volume2, Copy, Check
} from 'lucide-react';

/**
 * TranscriptPanel - Live transcript display showing original and translated text
 * Provides visual proof that translation is working correctly for judges
 */
const TranscriptPanel = ({ 
  transcripts = [], 
  isOpen = false, 
  onToggle,
  userName = 'You',
  partnerName = 'Partner'
}) => {
  const [copied, setCopied] = useState(null);
  const scrollRef = useRef(null);
  
  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, isOpen]);
  
  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  const getEmotionEmoji = (emotion) => {
    const emotions = {
      'happy': '😊',
      'excited': '🎉',
      'sad': '😢',
      'angry': '😤',
      'frustrated': '😤',
      'confused': '🤔',
      'neutral': '😐',
      'calm': '😌',
    };
    return emotions[emotion?.toLowerCase()] || '💬';
  };
  
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-24 right-4 bg-gray-800/90 backdrop-blur-sm border border-gray-700 
                   rounded-full p-3 shadow-lg hover:bg-gray-700 transition-all duration-200
                   flex items-center gap-2 group"
      >
        <MessageSquare className="w-5 h-5 text-purple-400" />
        <span className="text-sm text-gray-300 hidden group-hover:inline">
          Show Transcript
        </span>
        {transcripts.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs 
                          rounded-full w-5 h-5 flex items-center justify-center">
            {transcripts.length > 99 ? '99+' : transcripts.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 w-96 max-h-[60vh] bg-gray-900/95 backdrop-blur-sm 
                    border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden
                    animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-white">Live Transcript</h3>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            {transcripts.length} messages
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      
      {/* Transcript List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]"
      >
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8">
            <Volume2 className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">Start speaking to see transcripts</p>
            <p className="text-xs mt-1">Both original and translated text will appear here</p>
          </div>
        ) : (
          transcripts.map((entry, index) => (
            <div 
              key={entry.id || index}
              className={`rounded-lg p-3 ${
                entry.isUser 
                  ? 'bg-purple-900/30 border border-purple-700/50 ml-4' 
                  : 'bg-gray-800/50 border border-gray-700/50 mr-4'
              }`}
            >
              {/* Speaker & Time */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${
                    entry.isUser ? 'text-purple-400' : 'text-blue-400'
                  }`}>
                    {entry.isUser ? userName : partnerName}
                  </span>
                  {entry.emotion && (
                    <span className="text-sm" title={`Emotion: ${entry.emotion}`}>
                      {getEmotionEmoji(entry.emotion)}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(entry.translated || entry.original, entry.id)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied === entry.id ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-gray-500" />
                  )}
                </button>
              </div>
              
              {/* Original Text */}
              <div className="mb-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    Original ({entry.sourceLanguage || 'detecting...'})
                  </span>
                  {entry.confidence && (
                    <span className={`text-[10px] ${getConfidenceColor(entry.confidence)}`}>
                      {Math.round(entry.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300">{entry.original}</p>
              </div>
              
              {/* Translated Text (if different language) */}
              {entry.translated && entry.translated !== entry.original && (
                <div className="pt-2 border-t border-gray-700/50">
                  <div className="flex items-center gap-1 mb-1">
                    <Languages className="w-3 h-3 text-purple-400" />
                    <span className="text-[10px] uppercase tracking-wider text-purple-400">
                      Translated ({entry.targetLanguage || 'auto'})
                    </span>
                    {entry.emotionPreserved && (
                      <Sparkles className="w-3 h-3 text-yellow-400" title="Emotion preserved" />
                    )}
                  </div>
                  <p className="text-sm text-white">{entry.translated}</p>
                </div>
              )}
              
              {/* Processing indicator */}
              {entry.processing && (
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  Processing...
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* Footer Stats */}
      <div className="p-2 border-t border-gray-700 bg-gray-800/30 flex items-center justify-between text-xs text-gray-500">
        <span>Vox Real-Time Translation</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>
    </div>
  );
};

export default TranscriptPanel;
