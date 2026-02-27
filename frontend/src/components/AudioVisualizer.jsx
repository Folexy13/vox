import React, { useRef, useEffect } from 'react';

/**
 * AudioVisualizer Component
 * Real-time waveform display using Canvas API
 */
const AudioVisualizer = ({ 
  stream, 
  isActive = false,
  color = '#1a73e8',
  backgroundColor = 'rgba(255, 255, 255, 0.05)',
  height = 60,
  className = ''
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Set up audio analysis
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Clear canvas
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw waveform
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Create gradient for active state
        if (isActive && dataArray[i] > 20) {
          const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, `${color}40`);
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = `${color}40`;
        }
        
        // Draw rounded bars
        const radius = barWidth / 2;
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth - 1, barHeight, radius);
        ctx.fill();
        
        x += barWidth;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive, color, backgroundColor]);

  // Fallback visualization when no stream
  useEffect(() => {
    if (stream) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let phase = 0;

    const drawIdle = () => {
      animationRef.current = requestAnimationFrame(drawIdle);
      
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const centerY = canvas.height / 2;
      const amplitude = isActive ? 15 : 5;
      const frequency = 0.05;
      
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      
      for (let x = 0; x < canvas.width; x++) {
        const y = centerY + Math.sin(x * frequency + phase) * amplitude;
        ctx.lineTo(x, y);
      }
      
      ctx.strokeStyle = isActive ? color : `${color}40`;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      phase += 0.05;
    };

    drawIdle();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [stream, isActive, color, backgroundColor]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={height}
      className={`rounded-lg ${className}`}
      style={{ width: '100%', height: `${height}px` }}
    />
  );
};

export default AudioVisualizer;
