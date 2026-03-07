import { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalAudio } from '../context/AudioContext';

/**
 * WebSocket Hook for real-time audio communication
 * Handles connection, audio streaming, and status updates
 */
export const useWebSocket = (roomId, userId, username, userLanguage = 'en-US', profileId = null, onTranscript = null, isAgent = false) => {
  const { getAudioContext } = useGlobalAudio();
  const [isConnected, setIsConnected] = useState(false);
  const [partnerJoined, setPartnerJoined] = useState(false);
  const [partnerName, setPartnerName] = useState('Guest');
  const [partnerLanguage, setPartnerLanguage] = useState('Detecting...');
  const [status, setStatus] = useState('connecting');
  const [partnerStatus, setPartnerStatus] = useState('idle');
  const [listeningToName, setListeningToName] = useState(null);
  
  const [partnerOnline, setPartnerOnline] = useState(true);
  
  const ws = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  const shouldReconnect = useRef(true);
  const heartbeatInterval = useRef(null);
  const lastPongTime = useRef(Date.now());

  // Stable refs for values used in callbacks to avoid dependency changes
  const usernameRef = useRef(username);
  const userLanguageRef = useRef(userLanguage);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => { usernameRef.current = username; }, [username]);
  useEffect(() => { userLanguageRef.current = userLanguage; }, [userLanguage]);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Initialize audio context for playback
  const initAudioContext = useCallback(() => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(err => console.warn('Could not resume audio context:', err));
    }
    return ctx;
  }, [getAudioContext]);

  // Track next scheduled playback time for seamless audio
  const nextPlayTime = useRef(0);
  const gainNode = useRef(null);

  // Play audio from PCM16 bytes with scheduled timing for smooth playback
  // isAgent mode uses 24kHz (Gemini native), meeting mode uses 16kHz (resampled by backend)
  const playAudio = useCallback((audioData) => {
    try {
      const ctx = initAudioContext();
      if (!ctx) return;
      
      // Determine sample rate based on mode:
      // - Agent mode: Gemini outputs at 24kHz natively
      // - Meeting mode: Backend resamples to 16kHz before sending to partner
      const sampleRate = isAgent ? 24000 : 16000;
      
      console.log(`Playing audio: ${audioData.byteLength} bytes at ${sampleRate}Hz, context state: ${ctx.state}`);
      
      // Create gain node once and reuse
      if (!gainNode.current) {
        gainNode.current = ctx.createGain();
        gainNode.current.gain.value = 1.0;
        gainNode.current.connect(ctx.destination);
      }
      
      // Ensure we have an even number of bytes for Int16Array
      const safeLength = Math.floor(audioData.byteLength / 2) * 2;
      const int16Data = new Int16Array(audioData.slice(0, safeLength));
      
      // Convert Int16 to Float32 for Web Audio API
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
      }
      
      // Create audio buffer with correct sample rate for the mode
      const buffer = ctx.createBuffer(1, float32Data.length, sampleRate);
      buffer.getChannelData(0).set(float32Data);
      
      const currentTime = ctx.currentTime;
      if (nextPlayTime.current < currentTime) {
        nextPlayTime.current = currentTime;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode.current);
      source.start(nextPlayTime.current);
      
      nextPlayTime.current += buffer.duration;
      
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [initAudioContext, isAgent]);

  // Process audio queue
  const processAudioQueue = useCallback(() => {
    while (audioQueue.current.length > 0) {
      const audioData = audioQueue.current.shift();
      playAudio(audioData);
    }
  }, [playAudio]);

  // Handle control messages
  const handleControlMessage = useCallback((data) => {
    switch (data.type) {
      case 'READY':
        setPartnerJoined(true);
        if (data.partnerName) setPartnerName(data.partnerName);
        if (data.partnerLanguage) setPartnerLanguage(data.partnerLanguage);
        setStatus('active');
        break;
      case 'PARTNER_LEFT':
        setPartnerJoined(false);
        setStatus('waiting');
        break;
      case 'LANGUAGE_UPDATE':
        if (data.user === 'partner') { setPartnerLanguage(data.language); }
        break;
      case 'STATUS':
        setStatus(data.status);
        if (data.listeningToName) {
          setListeningToName(data.listeningToName === usernameRef.current ? 'You' : data.listeningToName);
        }
        break;
      case 'PARTNER_STATUS':
        setPartnerStatus(data.status);
        if (data.partnerLanguage) { setPartnerLanguage(data.partnerLanguage); }
        break;
      case 'TRANSCRIPT':
        if (onTranscriptRef.current) {
          onTranscriptRef.current({
            isUser: data.isUser || false,
            original: data.original,
            translated: data.translated,
            sourceLanguage: data.sourceLanguage,
            targetLanguage: data.targetLanguage,
            confidence: data.confidence,
            emotion: data.emotion,
            emotionPreserved: data.emotionPreserved,
          });
        }
        break;
      case 'PONG':
        lastPongTime.current = Date.now();
        break;
      default:
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (!roomId || !userId || !username) return;
    if (!shouldReconnect.current) return;

    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
    const backendHost = backendUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const wsUrl = isAgent
      ? `${wsProtocol}//${backendHost}/ws/agent/${userId}`
      : `${wsProtocol}//${backendHost}/ws/${roomId}/${userId}`;
    
    setStatus('connecting');
    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      setIsConnected(true);
      setStatus('connected');
      reconnectAttempts.current = 0;
      lastPongTime.current = Date.now();
      ws.current.send(JSON.stringify({
        type: 'JOIN',
        username: usernameRef.current,
        language: userLanguageRef.current,
        profileId: profileId
      }));
      
      if (heartbeatInterval.current) { clearInterval(heartbeatInterval.current); }
      heartbeatInterval.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'PING' }));
          if (Date.now() - lastPongTime.current > 30000) {
            console.warn('No heartbeat response');
          }
        }
      }, 10000);
    };

    ws.current.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        audioQueue.current.push(event.data);
        processAudioQueue();
      } else if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          handleControlMessage(data);
        } catch (err) {}
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      if (shouldReconnect.current && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setStatus('reconnecting');
        setTimeout(connect, 2000);
      } else {
        setStatus('disconnected');
      }
    };
  }, [roomId, userId, profileId, isAgent, processAudioQueue, handleControlMessage]);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    if (heartbeatInterval.current) { clearInterval(heartbeatInterval.current); }
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'LEAVE', username: usernameRef.current }));
    }
    if (ws.current) { ws.current.close(); ws.current = null; }
    audioQueue.current = [];
    nextPlayTime.current = 0;
    setIsConnected(false);
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    shouldReconnect.current = true;
    connect();
    return () => { disconnect(); };
  }, [connect, disconnect]);

  const sendAudio = useCallback((audioBuffer, isSpeaking = true) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(audioBuffer);
    }
  }, []);

  const updateLanguage = useCallback((newLanguage) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'LANGUAGE_UPDATE', language: newLanguage }));
    }
  }, []);

  return { 
    isConnected, 
    partnerJoined, 
    partnerName,
    partnerLanguage,
    partnerOnline,
    status,
    partnerStatus,
    listeningToName,
    sendAudio,
    updateLanguage,
    disconnect
  };
};

export default useWebSocket;
