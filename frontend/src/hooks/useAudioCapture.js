import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Audio Capture Hook with Voice Activity Detection
 * Captures microphone audio in 100ms chunks and sends via callback
 * Uses volume-based VAD with proper PCM16 encoding
 */
export const useAudioCapture = (onAudioChunk, enabled = true) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const audioContext = useRef(null);
  const processor = useRef(null);
  const stream = useRef(null);
  const analyser = useRef(null);
  
  // Store callback in ref to avoid stale closure issues
  const onAudioChunkRef = useRef(onAudioChunk);
  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);
  
  // VAD state
  const vadState = useRef({
    speaking: false,
    silenceStart: null,
    speechStart: null,
  });
  
  // Audio buffer for accumulating samples
  const audioBuffer = useRef([]);
  const lastSendTime = useRef(Date.now());
  
  // VAD thresholds
  const SPEECH_THRESHOLD = 0.015;  // Volume threshold for speech detection
  const SILENCE_DURATION = 300;    // ms of silence before considering speech ended
  const CHUNK_INTERVAL = 100;      // Send audio every 100ms

  const startCapture = useCallback(async () => {
    if (isCapturing) return;
    
    try {
      // Request microphone access
      stream.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        } 
      });
      
      // Create audio context at 16kHz for optimal speech processing
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 16000 
      });
      
      const source = audioContext.current.createMediaStreamSource(stream.current);
      
      // Create analyser for VAD
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 2048;
      analyser.current.smoothingTimeConstant = 0.8;
      
      // Create script processor for audio capture
      // Using 4096 samples = ~256ms at 16kHz
      processor.current = audioContext.current.createScriptProcessor(4096, 1, 1);
      
      processor.current.onaudioprocess = (e) => {
        if (!enabled) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS volume for VAD
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        
        // Voice Activity Detection
        const now = Date.now();
        const wasSpeaking = vadState.current.speaking;
        
        if (rms > SPEECH_THRESHOLD) {
          // Speech detected
          vadState.current.speaking = true;
          vadState.current.silenceStart = null;
          
          if (!wasSpeaking) {
            vadState.current.speechStart = now;
            setIsSpeaking(true);
          }
        } else {
          // Silence detected
          if (wasSpeaking) {
            if (!vadState.current.silenceStart) {
              vadState.current.silenceStart = now;
            } else if (now - vadState.current.silenceStart > SILENCE_DURATION) {
              // Enough silence, speech ended
              vadState.current.speaking = false;
              setIsSpeaking(false);
            }
          }
        }
        
        // Accumulate audio samples
        audioBuffer.current.push(...inputData);
        
        // Send audio chunks at regular intervals
        if (now - lastSendTime.current >= CHUNK_INTERVAL) {
          if (audioBuffer.current.length > 0) {
            // Convert Float32 to PCM16
            const pcm16 = float32ToPCM16(audioBuffer.current);
            
            // Send audio with VAD state (use ref to get latest callback)
            if (onAudioChunkRef.current) {
              onAudioChunkRef.current(pcm16, vadState.current.speaking);
            }
            
            // Clear buffer
            audioBuffer.current = [];
            lastSendTime.current = now;
          }
        }
      };
      
      // Connect nodes
      source.connect(analyser.current);
      source.connect(processor.current);
      processor.current.connect(audioContext.current.destination);
      
      setIsCapturing(true);
      console.log('Audio capture started');
      
    } catch (err) {
      console.error('Audio capture failed:', err);
      throw err;
    }
  }, [enabled, onAudioChunk, isCapturing]);

  const stopCapture = useCallback(() => {
    if (processor.current) {
      processor.current.disconnect();
      processor.current = null;
    }
    if (analyser.current) {
      analyser.current.disconnect();
      analyser.current = null;
    }
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }
    if (stream.current) {
      stream.current.getTracks().forEach(track => track.stop());
      stream.current = null;
    }
    
    audioBuffer.current = [];
    setIsCapturing(false);
    setIsSpeaking(false);
    console.log('Audio capture stopped');
  }, []);

  // Auto-start capture when enabled
  useEffect(() => {
    if (enabled) {
      startCapture();
    } else {
      stopCapture();
    }
    
    return () => {
      stopCapture();
    };
  }, [enabled]);

  return { 
    isSpeaking, 
    isCapturing,
    startCapture, 
    stopCapture 
  };
};

/**
 * Convert Float32 audio samples to PCM16 bytes
 */
function float32ToPCM16(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1]
    let sample = Math.max(-1, Math.min(1, float32Array[i]));
    // Scale to int16 range
    sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(i * 2, sample, true); // little-endian
  }
  
  return buffer;
}

export default useAudioCapture;
