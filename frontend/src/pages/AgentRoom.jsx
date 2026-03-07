import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  MessageSquare, Settings, Users, Languages, Copy, Check,
  Sparkles, Info, Shield, Zap, Globe
} from 'lucide-react';
import useWebSocket from '../hooks/useWebSocket';
import useAudioCapture from '../hooks/useAudioCapture';
import AudioVisualizer from '../components/AudioVisualizer';
import TranscriptPanel from '../components/TranscriptPanel';
import StatusIndicator from '../components/StatusIndicator';
import EmotionBadge from '../components/EmotionBadge';
import LanguageBadge from '../components/LanguageBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

const AgentRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  
  // Get user info from state or sessionStorage (for rejoining)
  const sessionKey = `vox_room_${roomId}`;
  
  // Prevent infinite re-renders by using lazy initialization for variables that use Math.random()
  const [userId] = useState(() => {
    const storedSession = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    return state?.userId || storedSession?.userId || `user_${Math.random().toString(36).substring(7)}`;
  });
  
  const [userName] = useState(() => {
    const storedSession = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    return state?.userName || storedSession?.userName || 'Guest';
  });
  
  const [userLanguage] = useState(() => {
    const storedSession = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    return state?.userLanguage || storedSession?.userLanguage || 'American English';
  });
  
  const [profileId] = useState(() => {
    const storedSession = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    return state?.profileId || storedSession?.profileId || null;
  });

  // UI State
  const [micOn, setMicOn] = useState(true);
  const [showTranscripts, setShowTranscripts] = useState(true);
  const [transcripts, setTranscripts] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  
  // App state from useWebSocket
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(userLanguage);

  // Available languages
  const languages = [
    { name: 'American English', code: 'en-US', flag: '🇺🇸' },
    { name: 'British English', code: 'en-GB', flag: '🇬🇧' },
    { name: 'Nigerian English', code: 'en-NG', flag: '🇳🇬' },
    { name: 'French', code: 'fr-FR', flag: '🇫🇷' },
    { name: 'Spanish', code: 'es-ES', flag: '🇪🇸' },
    { name: 'Portuguese', code: 'pt-BR', flag: '🇧🇷' },
    { name: 'German', code: 'de-DE', flag: '🇩🇪' }
  ];

  const languageCodeMap = {
    'American English': 'en-US',
    'British English': 'en-GB',
    'Nigerian English': 'en-NG',
    'French': 'fr-FR',
    'Spanish': 'es-ES',
    'Portuguese': 'pt-BR',
    'German': 'de-DE'
  };

  const userLanguageCode = languageCodeMap[currentLanguage] || 'en-US';

  // Refs
  const userVideoRef = useRef(null);

  // Add transcript entry
  const addTranscript = useCallback((data) => {
    setTranscripts(prev => [
      ...prev, 
      { ...data, id: Date.now(), timestamp: new Date() }
    ].slice(-50)); // Keep last 50
  }, []);

  // WebSocket connection
  const {
    isConnected,
    partnerJoined,
    status,
    partnerStatus,
    sendAudio,
    updateLanguage,
    disconnect
  } = useWebSocket(roomId, userId, userName, userLanguageCode, profileId, addTranscript, true);

  // Redirect if joined directly without setup
  useEffect(() => {
    if (!userName || !currentLanguage) {
      navigate(`/setup/${roomId}`);
    }
  }, [userName, currentLanguage, navigate, roomId]);

  // Handle language change
  const handleLanguageChange = useCallback((lang) => {
    setCurrentLanguage(lang.name);
    updateLanguage(lang.code);
    setShowLanguagePicker(false);
    
    // Update session storage
    const session = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    sessionStorage.setItem(sessionKey, JSON.stringify({
      ...session,
      userLanguage: lang.name
    }));
  }, [updateLanguage, sessionKey]);

  // Handle audio from capture
  const handleAudioChunk = useCallback((audioBuffer, isSpeaking) => {
    // Only send audio when status is active (READY received), otherwise backend receives binary before JSON
    if (micOn && status === 'active') {
      sendAudio(audioBuffer, isSpeaking);
    }
  }, [micOn, status, sendAudio]);

  const { isSpeaking, isCapturing, stopCapture } = useAudioCapture(handleAudioChunk, micOn);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCapture();
      disconnect();
    };
  }, [stopCapture, disconnect]);

  const handleEndCall = () => {
    navigate('/');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (!userName || !currentLanguage) return <LoadingSpinner fullScreen message="Initializing neural link..." />;

  return (
    <div className="h-screen w-full bg-[#050505] flex flex-col overflow-hidden text-white font-sans selection:bg-google-blue/30">
      {/* Background Atmosphere */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-google-blue/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-google-red/5 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      {/* Top Header */}
      <header className="h-16 sm:h-20 px-4 sm:px-8 flex items-center justify-between z-50 bg-[#050505]/40 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center space-x-4 w-1/4">
          <div className="bg-gradient-to-br from-google-blue to-blue-600 p-2 rounded-xl shadow-lg shadow-google-blue/20">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter leading-none">VOX<span className="text-google-blue font-light">.</span></h1>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">AI Companion</p>
          </div>
        </div>

        <div className="flex-1 flex justify-center items-center">
          <div className="hidden sm:flex items-center px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl">
            <div className={`w-2 h-2 rounded-full mr-3 animate-pulse ${isConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
            <span className="text-xs font-bold tracking-widest uppercase text-gray-300">
              {isConnected ? 'Neural Link Active' : 'Establishing Link...'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-4 w-1/4">
          <div className="relative">
            <button 
              onClick={() => setShowLanguagePicker(!showLanguagePicker)}
              className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition-all active:scale-95 group"
            >
              <Languages className="w-4 h-4 text-google-blue group-hover:rotate-12 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest text-gray-300">{currentLanguage}</span>
            </button>
            
            {showLanguagePicker && (
              <div className="absolute top-full mt-2 right-0 w-56 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-[100] animate-in fade-in slide-in-from-top-2">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang)}
                    className={`w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-left ${
                      currentLanguage === lang.name ? 'text-google-blue bg-google-blue/5' : 'text-gray-400'
                    }`}
                  >
                    <span className="text-lg mr-3">{lang.flag}</span>
                    <span className="text-sm font-bold uppercase tracking-wider">{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 sm:p-8 gap-6 z-10">
        
        {/* Visualizer Section */}
        <div className="flex-1 relative flex flex-col items-center justify-center bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-google-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          
          <div className="relative z-10 flex flex-col items-center">
            <AudioVisualizer 
              isSpeaking={partnerStatus === 'speaking' || status === 'speaking'} 
              color="#4285F4"
              size={300}
            />
            
            <div className="mt-12 text-center">
              <h2 className="text-4xl font-light tracking-tight text-white mb-2">
                {partnerStatus === 'speaking' ? "Vox is speaking..." : "Listening to you..."}
              </h2>
              <p className="text-sm text-gray-500 uppercase tracking-[0.3em] font-black">
                {currentLanguage} Mode Active
              </p>
            </div>
          </div>

          {/* Floating UI Elements */}
          <div className="absolute top-8 left-8">
            <StatusIndicator status={status} />
          </div>
          
          <div className="absolute bottom-8 right-8">
            <EmotionBadge emotion={transcripts.length > 0 ? transcripts[transcripts.length-1].emotion : 'neutral'} />
          </div>
        </div>

        {/* Transcript Section */}
        {showTranscripts && (
          <div className="w-full md:w-[400px] lg:w-[450px] flex flex-col h-[300px] md:h-auto bg-white/[0.02] border border-white/5 rounded-[2.5rem] backdrop-blur-sm">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-google-blue" />
                <span className="font-black text-xs uppercase tracking-[0.2em] text-gray-400">Neural Log</span>
              </div>
              <button 
                onClick={() => setTranscripts([])}
                className="text-[10px] uppercase font-black tracking-widest text-gray-600 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <TranscriptPanel transcripts={transcripts} userLanguage={currentLanguage} />
            </div>
          </div>
        )}
      </main>

      {/* Controls Footer */}
      <footer className="h-24 sm:h-32 flex items-center justify-center p-4 sm:p-8 z-50">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 px-6 py-4 rounded-[2rem] flex items-center space-x-6 sm:space-x-10 shadow-2xl shadow-black/50">
          
          <button 
            onClick={() => setMicOn(!micOn)}
            className={`p-4 sm:p-5 rounded-2xl transition-all active:scale-90 ${
              micOn 
                ? 'bg-white/10 text-white hover:bg-white/20' 
                : 'bg-google-red text-white shadow-lg shadow-google-red/30 scale-110'
            }`}
          >
            {micOn ? <Mic className="w-6 h-6 sm:w-7 sm:h-7" /> : <MicOff className="w-6 h-6 sm:w-7 sm:h-7" />}
          </button>

          <button 
            onClick={handleEndCall}
            className="group flex items-center space-x-3 bg-white/5 hover:bg-google-red text-white px-6 sm:px-8 py-4 sm:py-5 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-widest transition-all active:scale-95 border border-white/5"
          >
            <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6 group-hover:animate-bounce" />
            <span className="hidden xs:inline">End Session</span>
          </button>

          <button 
            onClick={() => setShowTranscripts(!showTranscripts)}
            className={`p-4 sm:p-5 rounded-2xl transition-all active:scale-90 border border-white/5 ${
              showTranscripts 
                ? 'bg-google-blue text-white shadow-lg shadow-google-blue/30' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>

        </div>
      </footer>
    </div>
  );
};

export default AgentRoom;
