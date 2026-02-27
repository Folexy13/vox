import { useState, useEffect, useRef } from 'react';

export const useWebRTC = (onRemoteTrack) => {
  const pc = useRef(null);
  const localStream = useRef(null);

  const initPC = async () => {
    pc.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.current.ontrack = (event) => {
      console.log('Received remote track');
      if (onRemoteTrack) onRemoteTrack(event.streams[0]);
    };

    localStream.current = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: true 
    });

    localStream.current.getTracks().forEach(track => {
      pc.current.addTrack(track, localStream.current);
    });

    return pc.current;
  };

  const createOffer = async () => {
    if (!pc.current) await initPC();
    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    return offer;
  };

  const handleAnswer = async (answer) => {
    if (!pc.current) return;
    await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleCandidate = async (candidate) => {
    if (!pc.current) return;
    await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
  };

  return { createOffer, handleAnswer, handleCandidate, localStream: localStream.current };
};
