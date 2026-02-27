import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  MoreVertical, Share, MessageSquare, Info, 
  Settings, Users, Languages, Copy, Check,
  Sparkles, Wifi, WifiOff, Eye
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioCapture } from '../hooks/useAudioCapture';
import StatusIndicator from '../components/StatusIndicator';
import Modal from '../components/Modal';

const CallRoom = () => {
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
      navigate(`/setup/${roomId}`);
    }
  }, [userName, userLanguage, navigate, roomId]);

  // UI State
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [showDetails, setShowDetails] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  
  // Video refs
  const userVideoRef = useRef(null);
  const partnerVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // Map language name to code
  const languageCodeMap = {
    'English': 'en-US',
    'French': 'fr-FR',
    'Spanish': 'es-ES',
    'Yoruba': 'yo-NG',
    'Igbo': 'ig-NG',
    'Hausa': 'ha-NG',
  };
  const userLanguageCode = languageCodeMap[userLanguage] || 'en-US';

  // WebSocket connection
  const { 
    isConnected, 
    partnerJoined, 
    partnerName, 
    partnerLanguage,
    status,
    partnerStatus,
    sendAudio,
    sendMuteState,
    disconnect
  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId);

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

      {/* Status Bar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
        <StatusIndicator 
          status={status} 
          partnerStatus={partnerStatus}
        />
      </div>

      {/* Main Grid Section */}
      <div className={`flex-1 p-6 pt-20 relative transition-all duration-700 ease-in-out ${
        partnerJoined ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'flex items-center justify-center'
      }`}>
        
        {/* User Card */}
        <div className={`relative rounded-3xl overflow-hidden transition-all duration-700 shadow-2xl border border-white/5 group ${
          partnerJoined ? 'h-full' : 'w-full max-w-5xl aspect-video'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm z-0" />
          
          {/* Video element */}
          {videoOn ? (
            <video
              ref={userVideoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover z-10"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-tr from-google-blue to-blue-400 flex items-center justify-center text-5xl font-light border-4 border-white/10 transition-all duration-300 ${
                isSpeaking ? 'shadow-[0_0_70px_rgba(26,115,232,0.6)] scale-105' : 'shadow-[0_0_50px_rgba(26,115,232,0.3)]'
              }`}>
                {userName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          {/* User info badge */}
          <div className="absolute bottom-6 left-6 z-20 flex items-center bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-medium border border-white/10">
            <div className="mr-3 flex space-x-1">
              <div className={`w-1 h-3 bg-google-blue rounded-full ${isSpeaking ? 'animate-pulse' : 'opacity-20'}`} />
              <div className={`w-1 h-5 bg-blue-400 rounded-full ${isSpeaking ? 'animate-pulse delay-75' : 'opacity-20'}`} />
              <div className={`w-1 h-2 bg-google-blue/50 rounded-full ${isSpeaking ? 'animate-pulse delay-150' : 'opacity-20'}`} />
            </div>
            {userName} (You)
          </div>

          {/* User status badges */}
          <div className="absolute top-6 right-6 z-20 flex items-center space-x-2">
            <div className="bg-google-blue/20 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold flex items-center border border-google-blue/30 text-blue-300">
              <Languages className="w-3.5 h-3.5 mr-2" />
              {userLanguage}
            </div>
            <div className="bg-white/5 backdrop-blur-md p-2 rounded-xl border border-white/10">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-google-green" />
              ) : (
                <WifiOff className="w-4 h-4 text-google-red" />
              )}
            </div>
            {!micOn && (
              <div className="bg-google-red/20 backdrop-blur-md p-2 rounded-xl border border-google-red/30">
                <MicOff className="w-4 h-4 text-google-red" />
              </div>
            )}
          </div>

          {/* Lip reading indicator (when video is on) */}
          {videoOn && (
            <div className="absolute top-6 left-6 z-20 bg-google-green/20 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold flex items-center border border-google-green/30 text-green-300">
              <Eye className="w-3.5 h-3.5 mr-2" />
              Lip Reading Active
            </div>
          )}
        </div>

        {/* Partner Card */}
        {partnerJoined && (
          <div className="relative rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-1000 shadow-2xl border border-white/5 group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm z-0" />
            
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="relative">
                <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-tr from-google-red to-rose-400 flex items-center justify-center text-5xl font-light border-4 border-white/10 transition-all duration-300 ${
                  partnerStatus === 'translating' || partnerStatus === 'reshaping_accent' 
                    ? 'shadow-[0_0_70px_rgba(234,67,53,0.6)] scale-105 animate-pulse' 
                    : 'shadow-[0_0_50px_rgba(234,67,53,0.3)]'
                }`}>
                  {partnerName.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Partner info badge */}
            <div className="absolute bottom-6 left-6 z-20 flex items-center bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-medium border border-white/10">
              {partnerName}
              <div className="ml-3 flex space-x-1">
                <div className={`w-1 h-3 bg-white rounded-full ${partnerStatus !== 'idle' ? 'animate-pulse' : 'opacity-20'}`} />
                <div className={`w-1 h-2 bg-white rounded-full ${partnerStatus !== 'idle' ? 'animate-pulse delay-75' : 'opacity-20'}`} />
                <div className={`w-1 h-4 bg-white rounded-full ${partnerStatus !== 'idle' ? 'animate-pulse delay-150' : 'opacity-20'}`} />
              </div>
            </div>

            {/* Partner language badge */}
            <div className="absolute top-6 right-6 z-20 flex items-center space-x-2">
              <div className="bg-google-red/20 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold flex items-center border border-google-red/30 text-rose-300">
                <Languages className="w-3.5 h-3.5 mr-2" />
                {getLanguageDisplay(partnerLanguage)}
              </div>
            </div>

            {/* Translation indicator */}
            {(status === 'translating' || status === 'reshaping_accent') && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-google-blue/80 backdrop-blur-xl px-8 py-3 rounded-2xl text-sm font-bold shadow-2xl border border-white/20 flex items-center animate-bounce">
                <Sparkles className="w-4 h-4 mr-3 text-google-yellow fill-google-yellow" />
                {status === 'translating' ? 'Vox translating...' : 'Vox reshaping...'}
              </div>
            )}
          </div>
        )}

        {/* Floating Meeting Details Popover */}
        {showDetails && !partnerJoined && (
          <div className="absolute bottom-10 left-10 z-40 bg-white/10 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl max-w-sm animate-in slide-in-from-left-8 duration-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-white/90 flex items-center">
                <Info className="w-5 h-5 mr-2 text-google-blue" />
                Waiting for Partner
              </h3>
            </div>
            <p className="text-sm text-gray-400 mb-4 leading-relaxed font-light">
              Share this meeting link with someone to start a real-time translated conversation.
            </p>
            <div 
              onClick={copyLink}
              className="flex items-center justify-between bg-black/30 p-3 rounded-2xl text-sm border border-white/5 group hover:border-google-blue/30 transition-all cursor-pointer"
            >
              <span className="truncate mr-4 text-google-blue/80 font-mono text-xs">
                {window.location.origin}/setup/{roomId}
              </span>
              {copied ? (
                <Check className="w-4 h-4 text-google-green" />
              ) : (
                <Copy className="w-4 h-4 text-google-blue" />
              )}
            </div>
            {copied && (
              <p className="text-xs text-google-green mt-2 text-center">Link copied!</p>
            )}
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="h-28 bg-[#121212] flex items-center justify-between px-10 border-t border-white/5 z-50">
        <div className="flex items-center space-x-6 w-1/4">
          <div className="text-lg font-light text-white/80 border-r border-white/10 pr-6">
            {time}
          </div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest hidden lg:block">
            {roomId}
          </div>
        </div>

        <div className="flex items-center space-x-5">
          <button 
            onClick={toggleMic}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border shadow-lg ${
              micOn ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-google-red border-transparent hover:bg-red-600'
            }`}
          >
            {micOn ? <Mic className="w-6 h-6 text-gray-300" /> : <MicOff className="w-6 h-6 text-white" />}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border shadow-lg ${
              videoOn ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-google-red border-transparent hover:bg-red-600'
            }`}
          >
            {videoOn ? <Video className="w-6 h-6 text-gray-300" /> : <VideoOff className="w-6 h-6 text-white" />}
          </button>

          <div className="w-px h-10 bg-white/5 mx-2" />

          <button 
            onClick={copyLink}
            className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 group"
          >
            <Share className="w-6 h-6 text-gray-300 group-hover:text-google-blue transition-colors" />
          </button>

          <button className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 group">
            <MessageSquare className="w-6 h-6 text-gray-300 group-hover:text-google-blue transition-colors" />
          </button>
          
          <button 
            onClick={confirmLeave}
            className="h-14 px-8 rounded-2xl bg-google-red hover:bg-red-600 flex items-center justify-center transition-all shadow-2xl shadow-google-red/20"
          >
            <PhoneOff className="w-6 h-6 mr-3 rotate-[-135deg]" />
            <span className="text-sm font-bold uppercase tracking-[0.2em]">Leave</span>
          </button>
        </div>

        <div className="flex items-center justify-end space-x-8 w-1/4">
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
    </div>
  );
};

export default CallRoom;
