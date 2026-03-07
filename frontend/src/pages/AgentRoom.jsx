import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  MoreVertical, Share, MessageSquare, Info, 
  Settings, Users, Languages, Copy, Check,
  Sparkles, Wifi, WifiOff, Eye, Loader2
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioCapture } from '../hooks/useAudioCapture';
import StatusIndicator from '../components/StatusIndicator';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import TranscriptPanel from '../components/TranscriptPanel';

const AgentRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  
  // Get user info from state or sessionStorage (for rejoining)
  const sessionKey = `vox_room_${roomId}`;
  const storedSession = useMemo(() => {
    try {
      const stored = sessionStorage.getItem(sessionKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, [sessionKey]);
  
  const userName = state?.userName || storedSession?.userName || null;
  const userLanguage = state?.userLanguage || storedSession?.userLanguage || null;
  const profileId = state?.profileId || storedSession?.profileId || null;
  const userId = useMemo(() => {
    // Reuse stored userId for rejoining, or generate new one
    return storedSession?.userId || Math.random().toString(36).substring(7);
  }, [storedSession]);
  
  // Store session info for rejoining
  useEffect(() => {
    if (userName && userLanguage) {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        userName,
        userLanguage,
        profileId,
        userId
      }));
    }
  }, [sessionKey, userName, userLanguage, profileId, userId]);
  
  // Redirect to setup if no user info (neither from state nor sessionStorage)
  useEffect(() => {
    if (!userName || !userLanguage) {
      navigate(`/setup/${roomId}`, { replace: true });
    }
  }, [userName, userLanguage, navigate, roomId]);

  // Show loading while checking session
  if (!userName || !userLanguage) {
    return (
      <div className="min-h-screen bg-google-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-google-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading meeting...</p>
        </div>
      </div>
    );
  }

  // UI State
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [showDetails, setShowDetails] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(userLanguage);
  
  // Transcript state for live transcript panel
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const transcriptIdRef = useRef(0);
  
  // Add transcript entry
  const addTranscript = useCallback((entry) => {
    transcriptIdRef.current += 1;
    setTranscripts(prev => [...prev, {
      id: transcriptIdRef.current,
      timestamp: Date.now(),
      ...entry
    }].slice(-100)); // Keep last 100 entries
  }, []);
  
  // Video refs
  const userVideoRef = useRef(null);
  const partnerVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // Available languages with codes - including Nigerian languages as differentiators
  const languages = [
    // English variants
    { name: 'English (US)', code: 'en-US', flag: '🇺🇸' },
    { name: 'English (UK)', code: 'en-GB', flag: '🇬🇧' },
    { name: 'English (Nigerian)', code: 'en-NG', flag: '🇳🇬' },
    // Nigerian languages - STRATEGIC DIFFERENTIATORS
    // { name: 'Yoruba', code: 'yo-NG', flag: '🇳🇬', highlight: true },
    // { name: 'Igbo', code: 'ig-NG', flag: '🇳🇬', highlight: true },
    // { name: 'Hausa', code: 'ha-NG', flag: '🇳🇬', highlight: true },
    // European languages
    { name: 'French', code: 'fr-FR', flag: '🇫🇷' },
    { name: 'Spanish', code: 'es-ES', flag: '🇪🇸' },
    { name: 'Portuguese', code: 'pt-BR', flag: '🇧🇷' },
    { name: 'German', code: 'de-DE', flag: '🇩🇪' },
    // Asian languages
    { name: 'Chinese', code: 'zh-CN', flag: '🇨🇳' },
    { name: 'Japanese', code: 'ja-JP', flag: '🇯🇵' },
    { name: 'Korean', code: 'ko-KR', flag: '🇰🇷' },
    // Middle Eastern
    { name: 'Arabic', code: 'ar-SA', flag: '🇸🇦' },
  ];

  // Map language name to code
  const languageCodeMap = {
    'English (US)': 'en-US',
    'English (UK)': 'en-GB',
    'English (Nigerian)': 'en-NG',
    'English': 'en-US',  // Fallback for old data
    'Yoruba': 'yo-NG',
    'Igbo': 'ig-NG',
    'Hausa': 'ha-NG',
    'French': 'fr-FR',
    'Spanish': 'es-ES',
    'Portuguese': 'pt-BR',
    'German': 'de-DE',
    'Chinese': 'zh-CN',
    'Japanese': 'ja-JP',
    'Korean': 'ko-KR',
    'Arabic': 'ar-SA',
  };
  const userLanguageCode = languageCodeMap[currentLanguage] || currentLanguage || 'en-US';

  // WebSocket connection with transcript callback
  const { 
    isConnected, 
    partnerJoined, 
    partnerName, 
    partnerLanguage,
    status,
    partnerStatus,
    listeningToName,
    sendAudio,
    sendMuteState,
    updateLanguage,
    disconnect
  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId, addTranscript, true);

  // Handle language change
  const handleLanguageChange = useCallback((lang) => {
    setCurrentLanguage(lang.name);
    updateLanguage(lang.code);
    setShowLanguagePicker(false);
    // Update session storage
    sessionStorage.setItem(sessionKey, JSON.stringify({
      userName,
      userLanguage: lang.name,
      profileId,
      userId
    }));
  }, [updateLanguage, sessionKey, userName, profileId, userId]);

  // Audio capture with callback
  const handleAudioChunk = useCallback((audioBuffer, isSpeaking) => {
    if (micOn && isConnected) {
      sendAudio(audioBuffer, isSpeaking);
    }
  }, [micOn, isConnected, sendAudio]);

  const { isSpeaking, isCapturing, stopCapture } = useAudioCapture(handleAudioChunk, micOn);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle video toggle
  const toggleVideo = useCallback(async () => {
    if (!videoOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          } 
        });
        localStreamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
        setVideoOn(true);
      } catch (err) {
        console.error('Failed to access camera:', err);
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = null;
      }
      setVideoOn(false);
    }
  }, [videoOn]);

  // Handle mic toggle
  const toggleMic = useCallback(() => {
    const newState = !micOn;
    setMicOn(newState);
    sendMuteState(!newState);
  }, [micOn, sendMuteState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop video
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      // Stop audio capture
      if (stopCapture) {
        stopCapture();
      }
      // Disconnect WebSocket
      if (disconnect) {
        disconnect();
      }
    };
  }, [stopCapture, disconnect]);

  const handleEndCall = useCallback(() => {
    // Stop video
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    // Stop audio capture
    if (stopCapture) {
      stopCapture();
    }
    // Disconnect WebSocket
    if (disconnect) {
      disconnect();
    }
    // Navigate home
    navigate('/');
  }, [stopCapture, disconnect, navigate]);

  const confirmLeave = () => {
    setShowLeaveModal(true);
  };

  const copyLink = () => {
    const link = `${window.location.origin}/setup/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get display language name
  const getLanguageDisplay = (langCode) => {
    if (!langCode || langCode === 'Detecting...') return 'Detecting...';
    const langMap = {
      'en-US': 'English (US)',
      'en-GB': 'English (UK)',
      'en-NG': 'English (NG)',
      'fr-FR': 'French',
      'es-ES': 'Spanish',
      'yo-NG': 'Yoruba',
      'ig-NG': 'Igbo',
      'ha-NG': 'Hausa',
      'ar-SA': 'Arabic',
      'zh-CN': 'Mandarin',
    };
    return langMap[langCode] || langCode;
  };

  return (
    <div className="h-screen bg-[#121212] flex flex-col overflow-hidden text-white font-sans selection:bg-google-blue/30">
      
      {/* Leave Confirmation Modal */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        type="warning"
        title="Leave Meeting?"
        message="Are you sure you want to leave this meeting? You can rejoin later using the same meeting link."
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={handleEndCall}
        onCancel={() => setShowLeaveModal(false)}
      />

      {/* Joining/Reconnecting Loader Overlay */}
      {(status === 'connecting' || status === 'reconnecting') && (
        <div className="absolute inset-0 z-[100] bg-[#121212]/95 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-google-blue to-blue-400 flex items-center justify-center animate-pulse">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-google-blue/30 animate-ping" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-medium text-white mb-2">
                {status === 'connecting' ? 'Joining Meeting...' : 'Reconnecting...'}
              </h2>
              <p className="text-sm text-gray-400">
                {status === 'connecting' 
                  ? 'Setting up your connection' 
                  : 'Please wait while we restore your connection'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Connection Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 z-[100] bg-[#121212]/95 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="flex flex-col items-center space-y-6 max-w-md text-center px-6">
            <div className="w-20 h-20 rounded-full bg-google-red/20 flex items-center justify-center">
              <WifiOff className="w-10 h-10 text-google-red" />
            </div>
            <div>
              <h2 className="text-xl font-medium text-white mb-2">Connection Failed</h2>
              <p className="text-sm text-gray-400 mb-6">
                Unable to connect to the meeting. Please check your internet connection and try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-google-blue hover:bg-blue-600 rounded-xl text-white font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
        <StatusIndicator 
          status={status} 
          partnerStatus={partnerStatus}
          listeningToName={listeningToName}
        />
      </div>

      {/* Main Grid Section */}
      <div className={`flex-1 p-3 sm:p-6 pt-16 sm:pt-20 relative transition-all duration-700 ease-in-out ${
        partnerJoined ? 'grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6' : 'flex items-center justify-center'
      }`}>
        
        {/* User Card */}
        <div className={`relative rounded-3xl overflow-hidden transition-all duration-700 shadow-2xl border border-white/5 group ${
          partnerJoined ? 'h-full' : 'w-full max-w-5xl aspect-video'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm z-0" />
          
          {/* Video element - always rendered but hidden when off */}
          <video
            ref={userVideoRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover z-10 ${videoOn ? 'block' : 'hidden'}`}
          />
          {/* Avatar when video is off */}
          {!videoOn && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className={`w-24 h-24 sm:w-32 sm:h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-tr from-google-blue to-blue-400 flex items-center justify-center text-3xl sm:text-4xl md:text-5xl font-light border-2 sm:border-4 border-white/10 transition-all duration-300 ${
                isSpeaking ? 'shadow-[0_0_50px_rgba(26,115,232,0.6)] sm:shadow-[0_0_70px_rgba(26,115,232,0.6)] scale-105' : 'shadow-[0_0_30px_rgba(26,115,232,0.3)] sm:shadow-[0_0_50px_rgba(26,115,232,0.3)]'
              }`}>
                {userName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          {/* User info badge */}
          <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-20 flex items-center bg-black/40 backdrop-blur-md px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium border border-white/10">
            <div className="mr-2 sm:mr-3 flex space-x-0.5 sm:space-x-1">
              <div className={`w-0.5 sm:w-1 h-2 sm:h-3 bg-google-blue rounded-full ${isSpeaking ? 'animate-pulse' : 'opacity-20'}`} />
              <div className={`w-0.5 sm:w-1 h-3 sm:h-5 bg-blue-400 rounded-full ${isSpeaking ? 'animate-pulse delay-75' : 'opacity-20'}`} />
              <div className={`w-0.5 sm:w-1 h-1.5 sm:h-2 bg-google-blue/50 rounded-full ${isSpeaking ? 'animate-pulse delay-150' : 'opacity-20'}`} />
            </div>
            <span className="truncate max-w-[100px] sm:max-w-none">{userName}</span> <span className="hidden sm:inline ml-1">(You)</span>
          </div>

          {/* User status badges */}
          <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-20 flex items-center space-x-1.5 sm:space-x-2">
            {/* Clickable language badge */}
            <div className="relative">
              <button
                onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                className="bg-google-blue/20 backdrop-blur-md px-2 py-1 sm:px-4 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold flex items-center border border-google-blue/30 text-blue-300 hover:bg-google-blue/30 transition-colors cursor-pointer"
              >
                <Languages className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">{currentLanguage}</span>
                <span className="xs:hidden">{currentLanguage?.slice(0, 2)}</span>
              </button>
              
              {/* Language picker dropdown */}
              {showLanguagePicker && (
                <div className="absolute top-full right-0 mt-2 bg-gray-900/95 backdrop-blur-md rounded-xl border border-white/10 shadow-xl overflow-hidden z-50 min-w-[140px]">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center space-x-2 hover:bg-white/10 transition-colors ${
                        currentLanguage === lang.name ? 'bg-google-blue/20 text-blue-300' : 'text-white'
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white/5 backdrop-blur-md p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-white/10">
              {isConnected ? (
                <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-google-green" />
              ) : (
                <WifiOff className="w-3 h-3 sm:w-4 sm:h-4 text-google-red" />
              )}
            </div>
            {!micOn && (
              <div className="bg-google-red/20 backdrop-blur-md p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-google-red/30">
                <MicOff className="w-3 h-3 sm:w-4 sm:h-4 text-google-red" />
              </div>
            )}
          </div>

          {/* Lip reading indicator (when video is on) */}
          {videoOn && (
            <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-20 bg-google-green/20 backdrop-blur-md px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold flex items-center border border-google-green/30 text-green-300">
              <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Lip Reading Active</span>
              <span className="sm:hidden">Lip Read</span>
            </div>
          )}
        </div>

        {/* Partner Card */}
        {partnerJoined && (
          <div className="relative rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-1000 shadow-2xl border border-white/5 group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm z-0" />
            
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="relative">
                <div className={`w-24 h-24 sm:w-32 sm:h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-tr from-google-red to-rose-400 flex items-center justify-center text-3xl sm:text-4xl md:text-5xl font-light border-2 sm:border-4 border-white/10 transition-all duration-300 ${
                  partnerStatus === 'translating' || partnerStatus === 'reshaping_accent' 
                    ? 'shadow-[0_0_50px_rgba(234,67,53,0.6)] sm:shadow-[0_0_70px_rgba(234,67,53,0.6)] scale-105 animate-pulse' 
                    : 'shadow-[0_0_30px_rgba(234,67,53,0.3)] sm:shadow-[0_0_50px_rgba(234,67,53,0.3)]'
                }`}>
                  {partnerName.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Partner info badge */}
            <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-20 flex items-center bg-black/40 backdrop-blur-md px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium border border-white/10">
              <span className="truncate max-w-[100px] sm:max-w-none">{partnerName}</span>
              <div className="ml-2 sm:ml-3 flex space-x-0.5 sm:space-x-1">
                <div className={`w-0.5 sm:w-1 h-2 sm:h-3 bg-white rounded-full ${partnerStatus !== 'idle' ? 'animate-pulse' : 'opacity-20'}`} />
                <div className={`w-0.5 sm:w-1 h-1.5 sm:h-2 bg-white rounded-full ${partnerStatus !== 'idle' ? 'animate-pulse delay-75' : 'opacity-20'}`} />
                <div className={`w-0.5 sm:w-1 h-2.5 sm:h-4 bg-white rounded-full ${partnerStatus !== 'idle' ? 'animate-pulse delay-150' : 'opacity-20'}`} />
              </div>
            </div>

            {/* Partner language badge */}
            <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-20 flex items-center space-x-1.5 sm:space-x-2">
              <div className="bg-google-red/20 backdrop-blur-md px-2 py-1 sm:px-4 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold flex items-center border border-google-red/30 text-rose-300">
                <Languages className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">{getLanguageDisplay(partnerLanguage)}</span>
                <span className="xs:hidden">{getLanguageDisplay(partnerLanguage)?.slice(0, 2)}</span>
              </div>
            </div>

            {/* Translation indicator */}
            {(status === 'translating' || status === 'reshaping_accent') && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-google-blue/80 backdrop-blur-xl px-4 py-2 sm:px-8 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold shadow-2xl border border-white/20 flex items-center animate-bounce">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-2 sm:mr-3 text-google-yellow fill-google-yellow" />
                {status === 'translating' ? 'Translating...' : 'Reshaping...'}
              </div>
            )}
          </div>
        )}

        {/* Floating Meeting Details Popover */}
        {showDetails && !partnerJoined && (
          <div className="absolute bottom-4 left-3 right-3 sm:right-auto sm:bottom-10 sm:left-10 z-40 bg-white/10 backdrop-blur-2xl p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl sm:max-w-sm animate-in slide-in-from-bottom-8 sm:slide-in-from-left-8 duration-700">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-medium text-white/90 flex items-center">
                <Info className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-google-blue" />
                Waiting for Partner
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4 leading-relaxed font-light">
              Share this meeting link with someone to start a real-time translated conversation.
            </p>
            <div 
              onClick={copyLink}
              className="flex items-center justify-between bg-black/30 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl text-sm border border-white/5 group hover:border-google-blue/30 transition-all cursor-pointer"
            >
              <span className="truncate mr-3 sm:mr-4 text-google-blue/80 font-mono text-[10px] sm:text-xs">
                {window.location.origin}/setup/{roomId}
              </span>
              {copied ? (
                <Check className="w-4 h-4 text-google-green flex-shrink-0" />
              ) : (
                <Copy className="w-4 h-4 text-google-blue flex-shrink-0" />
              )}
            </div>
            {copied && (
              <p className="text-xs text-google-green mt-2 text-center">Link copied!</p>
            )}
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="h-20 sm:h-28 bg-[#121212] flex items-center justify-center px-3 sm:px-6 md:px-10 border-t border-white/5 z-50">
        {/* Time - hidden on mobile */}
        <div className="hidden md:flex items-center space-x-6 w-1/4">
          <div className="text-lg font-light text-white/80 border-r border-white/10 pr-6">
            {time}
          </div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest hidden lg:block">
            {roomId}
          </div>
        </div>

        {/* Main Controls - centered and responsive */}
        <div className="flex items-center justify-center space-x-2 sm:space-x-3 md:space-x-5 flex-1 md:flex-none">
          <button 
            onClick={toggleMic}
            className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all border shadow-lg ${
              micOn ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-google-red border-transparent hover:bg-red-600'
            }`}
          >
            {micOn ? <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all border shadow-lg ${
              videoOn ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-google-red border-transparent hover:bg-red-600'
            }`}
          >
            {videoOn ? <Video className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
          </button>

          <div className="w-px h-8 sm:h-10 bg-white/5 mx-1 sm:mx-2 hidden sm:block" />

          <button 
            onClick={copyLink}
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 group"
          >
            <Share className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300 group-hover:text-google-blue transition-colors" />
          </button>

          {/* Chat button - hidden on very small screens */}
          <button className="hidden xs:flex w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 items-center justify-center transition-all border border-white/10 group">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300 group-hover:text-google-blue transition-colors" />
          </button>
          
          <button 
            onClick={confirmLeave}
            className="h-11 sm:h-14 px-4 sm:px-6 md:px-8 rounded-xl sm:rounded-2xl bg-google-red hover:bg-red-600 flex items-center justify-center transition-all shadow-2xl shadow-google-red/20"
          >
            <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6 sm:mr-3 rotate-[-135deg]" />
            <span className="hidden sm:inline text-sm font-bold uppercase tracking-[0.2em]">Leave</span>
          </button>
        </div>

        {/* Right side icons - hidden on mobile */}
        <div className="hidden md:flex items-center justify-end space-x-8 w-1/4">
          <div className={`cursor-pointer transition-colors ${partnerJoined ? 'text-google-blue' : 'text-gray-500'}`}>
            <Users className="w-6 h-6" />
          </div>
          <div className="cursor-pointer text-gray-500 hover:text-google-blue transition-colors">
            <Settings className="w-6 h-6" />
          </div>
          <div className="cursor-pointer text-gray-500 hover:text-white transition-colors">
            <MoreVertical className="w-6 h-6" />
          </div>
        </div>
      </div>
      
      {/* Live Transcript Panel - Side slider */}
      <TranscriptPanel
        transcripts={transcripts}
        isOpen={showTranscript}
        onToggle={() => setShowTranscript(!showTranscript)}
        userName={userName}
        partnerName={partnerName || 'Partner'}
        userLanguage={currentLanguage}
      />
    </div>
  );
};

export default AgentRoom;
