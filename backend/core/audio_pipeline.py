"""
Audio Pipeline Module
Main orchestrator for real-time audio processing, translation, and synthesis
"""
import asyncio
import struct
from typing import Dict, Optional, Tuple
from .interruption_handler import InterruptionHandler
from .language_detector import LanguageDetector
from .translator import Translator
from .voice_synthesizer import VoiceSynthesizer

class AudioPipeline:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.interruption_handler = InterruptionHandler(room_id)
        self.language_detector = LanguageDetector()
        self.translator = Translator()
        self.voice_synthesizer = VoiceSynthesizer()
        
        # User state tracking
        self.user_languages: Dict[str, str] = {}  # user_id -> language_code
        self.user_profiles: Dict[str, str] = {}   # user_id -> voice_profile_id
        self.audio_buffers: Dict[str, bytes] = {} # user_id -> accumulated audio
        
        # Processing state
        self.processing_status: Dict[str, str] = {}  # user_id -> status
        
    def set_user_profile(self, user_id: str, profile_id: str):
        """Set voice profile for a user"""
        self.user_profiles[user_id] = profile_id
        
    def set_user_language(self, user_id: str, language: str):
        """Set preferred language for a user"""
        self.user_languages[user_id] = language
        
    async def process_audio_chunk(
        self, 
        user_id: str, 
        partner_id: str, 
        audio_data: bytes,
        vad_speaking: bool = True
    ) -> Tuple[Optional[bytes], Optional[dict]]:
        """
        Orchestrates the pipeline per chunk:
        1. Handle interruption logic
        2. Detect Language
        3. Translate or Refine
        4. Synthesize with Voice Profile
        5. Return Audio and status
        
        Returns: (processed_audio, status_update)
        """
        # Step 1: Interruption Logic
        await self.interruption_handler.handle_audio_arrival(user_id, partner_id, vad_speaking)
        
        # If not speaking (VAD says silence), don't process
        if not vad_speaking:
            return None, {"type": "STATUS", "status": "listening"}
        
        # Step 2: Create task for processing to allow cancellation
        task = asyncio.create_task(self._run_pipeline(user_id, partner_id, audio_data))
        self.interruption_handler.register_task(user_id, task)
        
        try:
            result = await task
            return result
        except asyncio.CancelledError:
            print(f"PIPELINE CANCELLED for {user_id}")
            return None, {"type": "INTERRUPTED"}
        finally:
            self.interruption_handler.clear_task(user_id)

    async def _run_pipeline(
        self, 
        user_id: str, 
        partner_id: str, 
        audio_data: bytes
    ) -> Tuple[Optional[bytes], Optional[dict]]:
        """
        The actual processing pipeline:
        1. Detect language from audio
        2. Transcribe audio
        3. Translate if needed
        4. Synthesize to partner's language
        """
        status_update = {"type": "STATUS", "status": "processing"}
        
        try:
            # Convert incoming audio to proper format if needed
            # Expecting PCM16 at 16kHz
            pcm_audio = self._ensure_pcm16(audio_data)
            
            if len(pcm_audio) < 1600:  # Less than 100ms of audio
                return None, None
            
            # Step 1: Detect language and transcribe
            detection_result = await self.language_detector.detect_language(pcm_audio)
            
            detected_language = detection_result["language_code"]
            transcript = detection_result["transcript"]
            confidence = detection_result["confidence"]
            
            if not transcript or confidence < 0.5:
                # Not enough confidence, pass through or wait for more audio
                return None, {"type": "STATUS", "status": "listening"}
            
            # Update user's detected language
            self.user_languages[user_id] = detected_language
            
            # Get partner's language
            partner_language = self.user_languages.get(partner_id, "en-US")
            
            # Step 2: Determine if translation or accent clarification needed
            same_language = self.language_detector.are_same_language(
                detected_language, 
                partner_language
            )
            
            if same_language:
                # Same language - accent clarification only
                status_update = {
                    "type": "STATUS", 
                    "status": "reshaping_accent",
                    "from_language": detected_language,
                    "to_language": partner_language
                }
                
                # Clarify accent if different variants
                if detected_language != partner_language:
                    processed_text = await self.translator.clarify_accent(
                        transcript,
                        detected_language,
                        partner_language
                    )
                else:
                    processed_text = transcript
            else:
                # Different languages - full translation
                status_update = {
                    "type": "STATUS", 
                    "status": "translating",
                    "from_language": detected_language,
                    "to_language": partner_language
                }
                
                processed_text = await self.translator.translate(
                    transcript,
                    detected_language,
                    partner_language
                )
            
            if not processed_text:
                return None, status_update
            
            # Step 3: Synthesize to speech in partner's language
            # Use speaker's voice profile for voice matching
            speaker_profile = self.user_profiles.get(user_id)
            
            synthesized_audio = await self.voice_synthesizer.synthesize(
                processed_text,
                partner_language,
                speaker_profile
            )
            
            if synthesized_audio:
                # Add language update to status
                status_update["transcript"] = transcript
                status_update["translated"] = processed_text
                return synthesized_audio, status_update
            else:
                return None, status_update
                
        except Exception as e:
            print(f"Pipeline error: {e}")
            return None, {"type": "ERROR", "message": str(e)}
    
    def _ensure_pcm16(self, audio_data: bytes) -> bytes:
        """
        Ensure audio is in PCM16 format
        Handles conversion from Float32 if needed
        """
        # Check if it's Float32 data (from Web Audio API)
        # Float32 samples are 4 bytes each, PCM16 are 2 bytes
        if len(audio_data) % 4 == 0:
            try:
                # Try to interpret as Float32 and convert to PCM16
                num_samples = len(audio_data) // 4
                float_samples = struct.unpack(f'{num_samples}f', audio_data)
                
                # Convert to PCM16
                pcm_samples = []
                for sample in float_samples:
                    # Clamp to [-1, 1] and scale to int16 range
                    clamped = max(-1.0, min(1.0, sample))
                    pcm_sample = int(clamped * 32767)
                    pcm_samples.append(pcm_sample)
                
                return struct.pack(f'{len(pcm_samples)}h', *pcm_samples)
            except:
                pass
        
        # Already PCM16 or unknown format, return as-is
        return audio_data
    
    def get_call_state(self) -> str:
        """Get current call state from interruption handler"""
        return self.interruption_handler.get_state().value
