import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, ChevronLeft, ChevronRight, 
  Languages, Clock, Sparkles, X,
  Volume2, Copy, Check, User
} from 'lucide-react';

/**
 * TranscriptPanel - Live transcript display as a side panel
 * Shows transcripts in the user's language for easy reading
 * Provides visual proof that translation is working correctly for judges
 */
const TranscriptPanel = ({ 
  transcripts = [], 
  isOpen = false, 
  onToggle,
  userName = 'You',
  partnerName = 'Partner',
  userLanguage = 'en-US',
  className = ''
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
      'surprised': '😲',
      'worried': '😟',
    };
    return emotions[emotion?.toLowerCase()] || '💬';
  };
  
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  // Get the text to display based on who is speaking
  // IMPORTANT: Each user sees transcripts in THEIR language
  // - User's own messages: show original (what they said in their language)
  // - Partner's messages: show translated version (translated TO user's language)
  const getDisplayText = (entry) => {
    if (entry.isUser) {
      // User's own message - show what they said (original)
      // The "translated" field contains what the partner will hear
      return {
        primary: entry.original,
        secondary: entry.translated && entry.translated !== entry.original ? entry.translated : null,
        primaryLabel: 'You said',
        secondaryLabel: `Partner hears (${entry.targetLanguage || 'translated'})`,
      };
    } else {
      // Partner's message - show the TRANSLATED version (in user's language)
      // The "translated" field is what was translated TO the user's language
      // The "original" field is what the partner said in their language
      return {
        primary: entry.translated || entry.original,
        secondary: entry.original && entry.translated !== entry.original ? entry.original : null,
        primaryLabel: `${partnerName} said`,
        secondaryLabel: `Original (${entry.sourceLanguage || 'their language'})`,
      };
    }
  };

  // Collapsed state - show toggle button
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={`fixed top-1/2 right-0 -translate-y-1/2 bg-gray-800/90 backdrop-blur-sm 
                   border border-gray-700 border-r-0 rounded-l-xl p-3 shadow-lg 
                   hover:bg-gray-700 transition-all duration-200 flex flex-col items-center gap-2
                   ${className}`}
      >
        <ChevronLeft className="w-5 h-5 text-purple-400" />
        <MessageSquare className="w-5 h-5 text-purple-400" />
        {transcripts.length > 0 && (
          <span className="bg-purple-500 text-white text-xs rounded-full w-5 h-5 
                          flex items-center justify-center">
            {transcripts.length > 99 ? '99+' : transcripts.length}
          </span>
        )}
        <span className="text-xs text-gray-400 writing-mode-vertical" 
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          Transcript
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed top-0 right-0 h-full w-80 md:w-96 bg-gray-900/98 backdrop-blur-md 
                    border-l border-gray-700 shadow-2xl flex flex-col
                    animate-in slide-in-from-right duration-300 z-40
                    ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-semibold text-white">Live Transcript</h3>
            <p className="text-xs text-gray-400">
              {transcripts.length} messages • In your language
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          title="Close transcript panel"
        >
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      </div>
      
      {/* Legend */}
      <div className="px-4 py-2 border-b border-gray-700/50 bg-gray-800/30 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-gray-400">{userName}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-gray-400">{partnerName}</span>
        </div>
      </div>
      
      {/* Transcript List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8">
            <Volume2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No transcripts yet</p>
            <p className="text-xs mt-1 text-center px-4">
              Start speaking to see live transcripts.<br/>
              Partner's messages will appear in your language.
            </p>
          </div>
        ) : (
          transcripts.map((entry, index) => {
            const display = getDisplayText(entry);
            
            return (
              <div 
                key={entry.id || index}
                className={`rounded-xl p-3 transition-all duration-200 ${
                  entry.isUser 
                    ? 'bg-purple-900/30 border border-purple-700/30 ml-2' 
                    : 'bg-blue-900/20 border border-blue-700/30 mr-2'
                }`}
              >
                {/* Speaker Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      entry.isUser ? 'bg-purple-500/30' : 'bg-blue-500/30'
                    }`}>
                      <User className={`w-3 h-3 ${
                        entry.isUser ? 'text-purple-400' : 'text-blue-400'
                      }`} />
                    </div>
                    <span className={`text-sm font-medium ${
                      entry.isUser ? 'text-purple-400' : 'text-blue-400'
                    }`}>
                      {entry.isUser ? userName : partnerName}
                    </span>
                    {entry.emotion && entry.emotion !== 'neutral' && (
                      <span className="text-base" title={`Feeling ${entry.emotion}`}>
                        {getEmotionEmoji(entry.emotion)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">
                      {formatTime(entry.timestamp)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(display.primary, entry.id)}
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
                </div>
                
                {/* Primary Text (in user's language) */}
                <div className="mb-2">
                  <p className="text-sm text-white leading-relaxed">{display.primary}</p>
                </div>
                
                {/* Secondary Text (original if translated) */}
                {display.secondary && (
                  <div className="pt-2 border-t border-gray-700/30">
                    <div className="flex items-center gap-1 mb-1">
                      <Languages className="w-3 h-3 text-gray-500" />
                      <span className="text-[10px] text-gray-500">
                        {display.secondaryLabel}
                      </span>
                      {entry.emotionPreserved && (
                        <Sparkles className="w-3 h-3 text-yellow-400" title="Emotion preserved" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 italic">{display.secondary}</p>
                  </div>
                )}
                
                {/* Confidence indicator */}
                {entry.confidence && entry.confidence < 0.9 && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      entry.confidence >= 0.7 ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <span className={`text-[10px] ${getConfidenceColor(entry.confidence)}`}>
                      {Math.round(entry.confidence * 100)}% confidence
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Footer */}
      <div className="p-3 border-t border-gray-700 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Powered by Vox AI</span>
          </div>
          <span>Showing in {userLanguage}</span>
        </div>
      </div>
    </div>
  );
};

export default TranscriptPanel;
