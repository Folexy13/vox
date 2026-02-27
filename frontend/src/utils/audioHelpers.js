/**
 * Audio Helper Utilities
 * Functions for audio processing, format conversion, and playback
 */

/**
 * Convert Float32 audio samples to PCM16 bytes
 * @param {Float32Array|Array} float32Array - Float32 audio samples
 * @returns {ArrayBuffer} PCM16 audio bytes
 */
export function float32ToPCM16(float32Array) {
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

/**
 * Convert PCM16 bytes to Float32 samples
 * @param {ArrayBuffer} pcm16Buffer - PCM16 audio bytes
 * @returns {Float32Array} Float32 audio samples
 */
export function pcm16ToFloat32(pcm16Buffer) {
  const int16Array = new Int16Array(pcm16Buffer);
  const float32Array = new Float32Array(int16Array.length);
  
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  
  return float32Array;
}

/**
 * Calculate RMS (Root Mean Square) volume of audio samples
 * @param {Float32Array|Array} samples - Audio samples
 * @returns {number} RMS value (0.0 to 1.0)
 */
export function calculateRMS(samples) {
  if (!samples || samples.length === 0) return 0;
  
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  
  return Math.sqrt(sum / samples.length);
}

/**
 * Simple voice activity detection based on RMS volume
 * @param {Float32Array|Array} samples - Audio samples
 * @param {number} threshold - RMS threshold for speech detection
 * @returns {boolean} True if speech detected
 */
export function isSpeech(samples, threshold = 0.02) {
  return calculateRMS(samples) > threshold;
}

/**
 * Create an AudioContext with proper sample rate
 * @param {number} sampleRate - Desired sample rate
 * @returns {AudioContext} Audio context
 */
export function createAudioContext(sampleRate = 16000) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return new AudioContextClass({ sampleRate });
}

/**
 * Play PCM16 audio data
 * @param {ArrayBuffer} pcm16Data - PCM16 audio bytes
 * @param {AudioContext} audioContext - Audio context to use
 * @param {number} sampleRate - Sample rate of the audio
 */
export async function playPCM16Audio(pcm16Data, audioContext, sampleRate = 16000) {
  // Resume context if suspended
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  
  // Convert PCM16 to Float32
  const float32Data = pcm16ToFloat32(pcm16Data);
  
  // Create audio buffer
  const buffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
  buffer.getChannelData(0).set(float32Data);
  
  // Create and play source
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
  
  return source;
}

/**
 * Encode audio buffer to base64
 * @param {ArrayBuffer} buffer - Audio buffer
 * @returns {string} Base64 encoded string
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 to audio buffer
 * @param {string} base64 - Base64 encoded string
 * @returns {ArrayBuffer} Audio buffer
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Get audio duration in seconds
 * @param {ArrayBuffer} audioData - Audio data
 * @param {number} sampleRate - Sample rate
 * @param {boolean} isPCM16 - True if PCM16, false if Float32
 * @returns {number} Duration in seconds
 */
export function getAudioDuration(audioData, sampleRate = 16000, isPCM16 = true) {
  const bytesPerSample = isPCM16 ? 2 : 4;
  const numSamples = audioData.byteLength / bytesPerSample;
  return numSamples / sampleRate;
}

/**
 * Merge multiple audio buffers
 * @param {ArrayBuffer[]} buffers - Array of audio buffers
 * @returns {ArrayBuffer} Merged audio buffer
 */
export function mergeAudioBuffers(buffers) {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return result.buffer;
}

export default {
  float32ToPCM16,
  pcm16ToFloat32,
  calculateRMS,
  isSpeech,
  createAudioContext,
  playPCM16Audio,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  getAudioDuration,
  mergeAudioBuffers,
};
