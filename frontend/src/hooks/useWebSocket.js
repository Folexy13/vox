import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket Hook for real-time audio communication
 * Handles connection, audio streaming, and status updates
 */
export const useWebSocket = (roomId, userId, username, userLanguage = 'en-US', profileId = null, onTranscript = null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [partnerJoined, setPartnerJoined] = useState(false);
  const [partnerName, setPartnerName] = useState('Guest');
  const [partnerLanguage, setPartnerLanguage] = useState('Detecting...');
  const [status, setStatus] = useState('connecting');
  const [partnerStatus, setPartnerStatus] = useState('idle');
  const [listeningToName, setListeningToName] = useState(null);
  
  const [partnerOnline, setPartnerOnline] = useState(true);
  
  const ws = useRef(null);
  const audioContext = useRef(null);
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

  // Track next scheduled playback time for seamless audio
  const nextPlayTime = useRef(0);
  const gainNode = useRef(null);

  // Play audio from PCM16 bytes with scheduled timing for smooth playback
  const playAudio = useCallback((audioData) => {
    try {
      const ctx = initAudioContext();
      
      console.log(`Playing audio: ${audioData.byteLength} bytes, context state: ${ctx.state}`);
      
      // Resume context if suspended
      if (ctx.state === 'suspended') {
        console.log('AudioContext suspended, attempting to resume...');
        ctx.resume().then(() => {
          console.log('AudioContext resumed successfully');
        });
      }
      
      // Create gain node once and reuse
      if (!gainNode.current) {
        gainNode.current = ctx.createGain();
        gainNode.current.gain.value = 1.0;
        gainNode.current.connect(ctx.destination);
      }
      
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
      
      // Calculate when to play this chunk
      const currentTime = ctx.currentTime;
      const bufferDuration = buffer.duration;
      
      // Schedule playback - if we're behind, catch up
      if (nextPlayTime.current < currentTime) {
        nextPlayTime.current = currentTime;
      }
      
      // Create and schedule source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode.current);
      source.start(nextPlayTime.current);
      
      // Update next play time
      nextPlayTime.current += bufferDuration;
      
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [initAudioContext]);

  // Process audio queue - now just plays immediately since we use scheduled timing
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
        if (data.listeningToName) {
          setListeningToName(data.listeningToName === usernameRef.current ? 'You' : data.listeningToName);
        }
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
        
      case 'PONG':
        // Heartbeat response received
        lastPongTime.current = Date.now();
        break;
        
      case 'PARTNER_HEARTBEAT':
        // Partner's heartbeat status
        setPartnerOnline(data.online);
        break;
        
      case 'TRANSCRIPT':
        // Live transcript update - emit event for CallRoom to handle
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
        
      case 'ERROR':
        console.error('Server error:', data.message);
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!roomId || !userId || !username) return;
    if (!shouldReconnect.current) return;

    // Backend URL from environment variable (required for production)
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    
    if (!backendUrl) {
      console.error('VITE_BACKEND_URL environment variable is not set');
      setStatus('error');
      return;
    }
    
    // Convert http/https to ws/wss
    const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
    const backendHost = backendUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const wsUrl = isAgent
      ? `${wsProtocol}//${backendHost}/ws/agent/${userId}`
      : `${wsProtocol}//${backendHost}/ws/${roomId}/${userId}`;
    
    console.log(`Connecting to ${wsUrl} as ${usernameRef.current}`);
    setStatus('connecting');
    
    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      console.log('WebSocket Connected - Sending JOIN');
      setIsConnected(true);
      setStatus('connected');
      reconnectAttempts.current = 0;
      lastPongTime.current = Date.now();
      
      // Send JOIN message with user info
      ws.current.send(JSON.stringify({
        type: 'JOIN',
        username: usernameRef.current,
        language: userLanguageRef.current,
        profileId: profileId
      }));
      
      // Start heartbeat interval (every 10 seconds)
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      heartbeatInterval.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'PING' }));
          
          // Check if we haven't received a pong in 30 seconds
          const timeSinceLastPong = Date.now() - lastPongTime.current;
          if (timeSinceLastPong > 30000) {
            console.warn('No heartbeat response in 30s, connection may be stale');
            // Don't close immediately, let the server handle it
          }
        }
      }, 10000);
    };

    ws.current.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary audio data - queue for playback
        console.log(`Received audio data: ${event.data.byteLength} bytes`);
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
      // Don't set error status immediately, let onclose handle reconnection
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        setStatus('error');
      }
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket Closed:', event.code, event.reason);
      setIsConnected(false);
      
      // Attempt reconnection only if we should
      if (shouldReconnect.current && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
        setStatus('reconnecting');
        setTimeout(connect, 2000);
      } else if (reconnectAttempts.current >= maxReconnectAttempts) {
        setStatus('error');
      } else {
        setStatus('disconnected');
      }
    };
  }, [roomId, userId, profileId, processAudioQueue, handleControlMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket...');
    shouldReconnect.current = false;
    
    // Clear heartbeat interval
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
    
    // Send LEAVE message before closing
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'LEAVE',
        username: usernameRef.current
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
    nextPlayTime.current = 0;
    
    // Reset state
    setIsConnected(false);
    setPartnerJoined(false);
    setStatus('disconnected');
  }, []);

  // Send audio chunk with VAD state
  const sendAudio = useCallback((audioBuffer, isSpeaking = true) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Send as binary for efficiency
      console.log(`Sending audio: ${audioBuffer.byteLength} bytes, speaking: ${isSpeaking}`);
      ws.current.send(audioBuffer);
    } else {
      console.log(`Cannot send audio: ws=${!!ws.current}, readyState=${ws.current?.readyState}`);
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
    partnerOnline,
    status,
    partnerStatus,
    listeningToName,
    sendAudio,
    sendAudioWithVAD,
    updateLanguage,
    sendMuteState,
    disconnect
  };
};

export default useWebSocket;
