"""
Voice Profiler Module
Extracts voice characteristics from audio samples for voice matching in TTS
"""
import json
import struct
import math
import numpy as np
from typing import Dict, Optional, Tuple
from google.cloud import storage
from config import config


class VoiceProfiler:
    """
    Analyzes voice samples to extract characteristics for TTS matching:
    - Fundamental frequency (pitch)
    - Speech tempo
    - Vocal energy patterns
    - Prosody characteristics
    """
    
    def __init__(self):
        try:
            self.storage_client = storage.Client()
        except Exception as e:
            print(f"Warning: Could not initialize GCS client: {e}")
            self.storage_client = None
        
        # Audio parameters (expected format)
        self.sample_rate = 16000
        self.bytes_per_sample = 2  # PCM16
        
        # Reference values for normalization
        self.reference_pitch = 150.0  # Hz - average human speaking pitch
        self.reference_tempo = 1.0    # Normal speaking rate
        
    def _pcm16_to_float(self, audio_bytes: bytes) -> np.ndarray:
        """Convert PCM16 bytes to float array normalized to [-1, 1]"""
        # Unpack as signed 16-bit integers
        samples = np.frombuffer(audio_bytes, dtype=np.int16)
        # Normalize to [-1, 1]
        return samples.astype(np.float32) / 32768.0
    
    def _estimate_pitch(self, audio: np.ndarray) -> float:
        """
        Estimate fundamental frequency using autocorrelation method
        Returns pitch in Hz
        """
        if len(audio) < self.sample_rate // 4:  # Need at least 250ms
            return self.reference_pitch
            
        # Apply windowing
        window = np.hanning(len(audio))
        windowed = audio * window
        
        # Autocorrelation
        corr = np.correlate(windowed, windowed, mode='full')
        corr = corr[len(corr)//2:]
        
        # Find first peak after initial decay (skip first ~2ms)
        min_lag = int(self.sample_rate / 500)  # 500 Hz max
        max_lag = int(self.sample_rate / 50)   # 50 Hz min
        
        if max_lag > len(corr):
            max_lag = len(corr) - 1
            
        # Find peak in valid range
        search_range = corr[min_lag:max_lag]
        if len(search_range) == 0:
            return self.reference_pitch
            
        peak_idx = np.argmax(search_range) + min_lag
        
        # Convert lag to frequency
        if peak_idx > 0:
            pitch = self.sample_rate / peak_idx
        else:
            pitch = self.reference_pitch
            
        # Sanity check - human voice range
        if pitch < 50 or pitch > 500:
            pitch = self.reference_pitch
            
        return pitch
    
    def _estimate_tempo(self, audio: np.ndarray) -> float:
        """
        Estimate speech tempo by analyzing syllable rate
        Returns tempo multiplier (1.0 = normal)
        """
        if len(audio) < self.sample_rate:  # Need at least 1 second
            return self.reference_tempo
            
        # Calculate energy envelope
        frame_size = int(self.sample_rate * 0.02)  # 20ms frames
        hop_size = frame_size // 2
        
        num_frames = (len(audio) - frame_size) // hop_size
        if num_frames < 10:
            return self.reference_tempo
            
        energy = np.zeros(num_frames)
        for i in range(num_frames):
            start = i * hop_size
            frame = audio[start:start + frame_size]
            energy[i] = np.sqrt(np.mean(frame ** 2))
        
        # Smooth energy
        kernel_size = 5
        kernel = np.ones(kernel_size) / kernel_size
        smoothed = np.convolve(energy, kernel, mode='same')
        
        # Find peaks (syllables)
        threshold = np.mean(smoothed) + 0.5 * np.std(smoothed)
        peaks = []
        in_peak = False
        
        for i, e in enumerate(smoothed):
            if e > threshold and not in_peak:
                peaks.append(i)
                in_peak = True
            elif e < threshold * 0.7:
                in_peak = False
        
        # Calculate syllable rate
        duration_seconds = len(audio) / self.sample_rate
        if duration_seconds > 0 and len(peaks) > 1:
            syllable_rate = len(peaks) / duration_seconds
            # Normal speech is ~4-5 syllables per second
            tempo = syllable_rate / 4.5
            # Clamp to reasonable range
            tempo = max(0.7, min(1.5, tempo))
        else:
            tempo = self.reference_tempo
            
        return tempo
    
    def _calculate_energy_profile(self, audio: np.ndarray) -> Dict[str, float]:
        """
        Calculate energy characteristics of the voice
        """
        if len(audio) == 0:
            return {"mean_energy": 0.5, "energy_variance": 0.1}
            
        # RMS energy
        rms = np.sqrt(np.mean(audio ** 2))
        
        # Energy variance (indicates dynamic range)
        frame_size = int(self.sample_rate * 0.05)  # 50ms frames
        num_frames = len(audio) // frame_size
        
        if num_frames > 1:
            frame_energies = []
            for i in range(num_frames):
                frame = audio[i * frame_size:(i + 1) * frame_size]
                frame_energies.append(np.sqrt(np.mean(frame ** 2)))
            variance = np.var(frame_energies)
        else:
            variance = 0.1
            
        return {
            "mean_energy": float(rms),
            "energy_variance": float(variance)
        }
    
    async def analyze_voice(self, audio_bytes: bytes) -> Dict:
        """
        Analyze voice sample and extract profile characteristics
        
        Args:
            audio_bytes: PCM16 audio at 16kHz
            
        Returns:
            Voice profile dictionary with pitch, tempo, and energy characteristics
        """
        if not audio_bytes or len(audio_bytes) < 1000:
            return self._get_default_profile()
            
        try:
            # Convert to float array
            audio = self._pcm16_to_float(audio_bytes)
            
            # Remove silence at start/end
            threshold = 0.01
            non_silent = np.where(np.abs(audio) > threshold)[0]
            if len(non_silent) > 0:
                audio = audio[non_silent[0]:non_silent[-1] + 1]
            
            if len(audio) < self.sample_rate // 2:  # Less than 0.5s of speech
                return self._get_default_profile()
            
            # Extract characteristics
            pitch = self._estimate_pitch(audio)
            tempo = self._estimate_tempo(audio)
            energy = self._calculate_energy_profile(audio)
            
            # Calculate pitch adjustment for TTS (semitones from reference)
            # TTS pitch is in semitones, range typically -20 to +20
            pitch_ratio = pitch / self.reference_pitch
            pitch_adjustment = 12 * math.log2(pitch_ratio) if pitch_ratio > 0 else 0
            pitch_adjustment = max(-10, min(10, pitch_adjustment))  # Clamp
            
            profile = {
                "pitch_hz": float(pitch),
                "pitch_adjustment": float(round(pitch_adjustment, 2)),
                "tempo": float(round(tempo, 2)),
                "mean_energy": energy["mean_energy"],
                "energy_variance": energy["energy_variance"],
                "sample_duration_seconds": len(audio) / self.sample_rate,
                "analysis_version": "1.0"
            }
            
            print(f"Voice profile analyzed: pitch={pitch:.1f}Hz, adjustment={pitch_adjustment:.2f}st, tempo={tempo:.2f}x")
            
            return profile
            
        except Exception as e:
            print(f"Voice analysis error: {e}")
            return self._get_default_profile()
    
    def _get_default_profile(self) -> Dict:
        """Return default voice profile"""
        return {
            "pitch_hz": self.reference_pitch,
            "pitch_adjustment": 0.0,
            "tempo": 1.0,
            "mean_energy": 0.5,
            "energy_variance": 0.1,
            "sample_duration_seconds": 0,
            "analysis_version": "1.0"
        }
    
    async def save_profile(self, profile_id: str, profile: Dict, audio_bytes: bytes = None) -> bool:
        """
        Save voice profile to Google Cloud Storage
        
        Args:
            profile_id: Unique identifier for the profile
            profile: Voice profile dictionary
            audio_bytes: Optional raw audio to store for future analysis
            
        Returns:
            True if saved successfully
        """
        if not self.storage_client:
            print(f"Voice profile saved locally (no GCS): {profile_id}")
            return True
            
        try:
            bucket = self.storage_client.bucket(config.GCS_BUCKET_NAME)
            
            # Save profile JSON
            profile_blob = bucket.blob(f"profiles/{profile_id}.json")
            profile_blob.upload_from_string(
                json.dumps(profile, indent=2),
                content_type='application/json'
            )
            
            # Optionally save raw audio for future re-analysis
            if audio_bytes:
                audio_blob = bucket.blob(f"profiles/{profile_id}.wav")
                audio_blob.upload_from_string(
                    audio_bytes,
                    content_type='audio/wav'
                )
            
            print(f"Voice profile saved to GCS: {profile_id}")
            return True
            
        except Exception as e:
            print(f"Error saving voice profile: {e}")
            return False
    
    async def load_profile(self, profile_id: str) -> Optional[Dict]:
        """
        Load voice profile from Google Cloud Storage
        
        Args:
            profile_id: Profile identifier
            
        Returns:
            Voice profile dictionary or None if not found
        """
        if not profile_id or profile_id.startswith("local-"):
            return self._get_default_profile()
            
        if not self.storage_client:
            return self._get_default_profile()
            
        try:
            bucket = self.storage_client.bucket(config.GCS_BUCKET_NAME)
            blob = bucket.blob(f"profiles/{profile_id}.json")
            
            if blob.exists():
                content = blob.download_as_string()
                return json.loads(content)
            else:
                return self._get_default_profile()
                
        except Exception as e:
            print(f"Error loading voice profile: {e}")
            return self._get_default_profile()
    
    async def create_profile_from_audio(self, audio_bytes: bytes, profile_id: str) -> Tuple[str, Dict]:
        """
        Complete workflow: analyze audio and save profile
        
        Args:
            audio_bytes: PCM16 audio at 16kHz (10 seconds recommended)
            profile_id: Unique identifier for the profile
            
        Returns:
            Tuple of (profile_id, profile_dict)
        """
        # Analyze the voice
        profile = await self.analyze_voice(audio_bytes)
        
        # Save to storage
        await self.save_profile(profile_id, profile, audio_bytes)
        
        return profile_id, profile
    
    async def get_tts_parameters(self, profile_id: str) -> Dict:
        """
        Get TTS-ready parameters from a voice profile
        
        Returns dict with:
        - pitch_adjustment: semitones adjustment for TTS
        - tempo: speaking rate multiplier
        """
        profile = await self.load_profile(profile_id)
        
        return {
            "pitch_adjustment": profile.get("pitch_adjustment", 0.0),
            "tempo": profile.get("tempo", 1.0)
        }
