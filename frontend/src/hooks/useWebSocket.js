import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket Hook for real-time audio communication
 * Handles connection, audio streaming, and status updates
 */
export const useWebSocket = (roomId, userId, username, userLanguage = 'en-US', profileId = null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [partnerJoined, setPartnerJoined] = useState(false);
  const [partnerName, setPartnerName] = useState('Guest');
  const [partnerLanguage, setPartnerLanguage] = useState('Detecting...');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [partnerStatus, setPartnerStatus] = useState('idle');
  
  const ws = useRef(null);
  const audioContext = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  const shouldReconnect = useRef(true);

  // Initialize audio context for playback
  const initAudioContext = useCallback(() => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 16000 
      });
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    return audioContext.current;
  }, []);

  // Play audio from PCM16 bytes
  const playAudio = useCallback(async (audioData) => {
    try {
      const ctx = initAudioContext();
      
      // Convert ArrayBuffer to Int16Array
      const int16Data = new Int16Array(audioData);
      
      // Convert Int16 to Float32 for Web Audio API
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }
      
      // Create audio buffer
      const buffer = ctx.createBuffer(1, float32Data.length, 16000);
      buffer.getChannelData(0).set(float32Data);
      
      // Create gain node for volume control
      const gainNode = ctx.createGain();
      gainNode.gain.value = 1.0;
      gainNode.connect(ctx.destination);
      
      // Create and play source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start();
      
      // Return promise that resolves when audio finishes
      return new Promise((resolve) => {
        source.onended = resolve;
      });
      
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [initAudioContext]);

  // Process audio queue sequentially
  const processAudioQueue = useCallback(async () => {
    if (isPlaying.current || audioQueue.current.length === 0) return;
    
    isPlaying.current = true;
    
    while (audioQueue.current.length > 0) {
      const audioData = audioQueue.current.shift();
      await playAudio(audioData);
    }
    
    isPlaying.current = false;
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
        setPartnerName('');
        setPartnerLanguage('');
        setStatus('waiting');
        break;
        
      case 'LANGUAGE_UPDATE':
        if (data.user === 'partner') {
          setPartnerLanguage(data.language);
        }
        break;
        
      case 'STATUS':
        // Our own status update
        setStatus(data.status);
        break;
        
      case 'PARTNER_STATUS':
        // Partner's status update
        setPartnerStatus(data.status);
        if (data.partnerLanguage) {
          setPartnerLanguage(data.partnerLanguage);
        }
        break;
        
      case 'INTERRUPTED':
        setStatus('interrupted');
        setTimeout(() => setStatus('listening'), 500);
        break;
        
      case 'CROSSTALK':
        setStatus('crosstalk');
        break;
        
      case 'ERROR':
        console.error('Server error:', data.message);
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
    
    setMessages(prev => [...prev, data]);
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!roomId || !userId || !username) return;
    if (!shouldReconnect.current) return;

    // Use environment variable for backend URL, fallback to same host with port 8001
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    let wsUrl;
    
    if (backendUrl) {
      // If backend URL is provided, use it (convert http/https to ws/wss)
      const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
      const backendHost = backendUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      wsUrl = `${wsProtocol}//${backendHost}/ws/${roomId}/${userId}`;
    } else {
      // Fallback: use same hostname with port 8001
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      wsUrl = `${protocol}//${host}:8001/ws/${roomId}/${userId}`;
    }
    
    console.log(`Connecting to ${wsUrl} as ${username}`);
    setStatus('connecting');
    
    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      console.log('WebSocket Connected - Sending JOIN');
      setIsConnected(true);
      setStatus('connected');
      reconnectAttempts.current = 0;
      
      // Send JOIN message with user info
      ws.current.send(JSON.stringify({
        type: 'JOIN',
        username: username,
        language: userLanguage,
        profileId: profileId
      }));
    };

    ws.current.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary audio data - queue for playback
        audioQueue.current.push(event.data);
        processAudioQueue();
      } else if (typeof event.data === 'string') {
        // JSON control message
        try {
          const data = JSON.parse(event.data);
          console.log('Control Message:', data);
          
          handleControlMessage(data);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      }
    };

    ws.current.onerror = (err) => {
      console.error('WebSocket Error:', err);
      setStatus('error');
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket Closed:', event.code, event.reason);
      setIsConnected(false);
      setStatus('disconnected');
      
      // Attempt reconnection only if we should
      if (shouldReconnect.current && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
        setTimeout(connect, 2000);
      }
    };
  }, [roomId, userId, username, userLanguage, profileId, processAudioQueue, handleControlMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket...');
    shouldReconnect.current = false;
    
    // Send LEAVE message before closing
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'LEAVE',
        username: username
      }));
    }
    
    // Close WebSocket
    if (ws.current) {
      ws.current.close(1000, 'User left');
      ws.current = null;
    }
    
    // Close audio context
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }
    
    // Clear audio queue
    audioQueue.current = [];
    isPlaying.current = false;
    
    // Reset state
    setIsConnected(false);
    setPartnerJoined(false);
    setStatus('disconnected');
  }, [username]);

  // Send audio chunk with VAD state
  const sendAudio = useCallback((audioBuffer, isSpeaking = true) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Send as binary for efficiency
      ws.current.send(audioBuffer);
    }
  }, []);

  // Send audio with VAD metadata (JSON format)
  const sendAudioWithVAD = useCallback((audioBuffer, isSpeaking) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(audioBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);
      
      ws.current.send(JSON.stringify({
        type: 'AUDIO_WITH_VAD',
        audio: base64Audio,
        speaking: isSpeaking,
        timestamp: Date.now()
      }));
    }
  }, []);

  // Update language preference
  const updateLanguage = useCallback((newLanguage) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'LANGUAGE_UPDATE',
        language: newLanguage
      }));
    }
  }, []);

  // Send mute state
  const sendMuteState = useCallback((isMuted) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'MUTE',
        muted: isMuted
      }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    shouldReconnect.current = true;
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Resume audio context on user interaction
  useEffect(() => {
    const resumeAudio = () => {
      if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume();
      }
    };
    
    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);
    
    return () => {
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
  }, []);

  return { 
    isConnected, 
    partnerJoined, 
    partnerName,
    partnerLanguage,
    messages, 
    status,
    partnerStatus,
    sendAudio,
    sendAudioWithVAD,
    updateLanguage,
    sendMuteState,
    disconnect
  };
};

export default useWebSocket;
