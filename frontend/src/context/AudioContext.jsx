import React, { createContext, useContext, useRef } from 'react';

const AudioContextInstance = createContext(null);

export const AudioProvider = ({ children }) => {
  const audioContext = useRef(null);

  const getAudioContext = () => {
    if (!audioContext.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContext.current = new AudioContextClass({ sampleRate: 16000 });
        console.log("Global AudioContext created");
      }
    }
    return audioContext.current;
  };

  const unlock = async () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
      console.log("Global AudioContext unlocked/resumed");
      
      // Play silent buffer
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  };

  return (
    <AudioContextInstance.Provider value={{ getAudioContext, unlock }}>
      {children}
    </AudioContextInstance.Provider>
  );
};

export const useGlobalAudio = () => useContext(AudioContextInstance);
