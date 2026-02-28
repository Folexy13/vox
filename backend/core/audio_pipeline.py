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
        # CHOSEN language: what the user wants to HEAR (set from JOIN message)
        self.user_languages: Dict[str, str] = {}  # user_id -> chosen_language_code
        # DETECTED language: what language the user is SPEAKING (detected from audio)
        self.detected_languages: Dict[str, str] = {}  # user_id -> detected_language_code
        self.user_profiles: Dict[str, str] = {}   # user_id -> voice_profile_id
        self.audio_buffers: Dict[str, bytes] = {} # user_id -> accumulated audio
        self.silence_counters: Dict[str, int] = {} # user_id -> consecutive silence chunks
        
        # Processing state
        self.processing_status: Dict[str, str] = {}  # user_id -> status
        
        # Audio accumulation settings
        # At 16kHz, 2 bytes per sample: 32000 bytes = 1 second of audio
        # For real-time conversation, we need smaller buffers
        self.MIN_AUDIO_BYTES = 8000   # Minimum 0.25 second before processing (very fast response)
        self.MAX_AUDIO_BYTES = 48000  # Maximum 1.5 seconds (quick turnaround)
        self.SILENCE_THRESHOLD = 1    # Process after 1 silence chunk (immediate response)
        
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
        1. Accumulate audio until we have enough
        2. Handle interruption logic
        3. Detect Language
        4. Translate or Refine
        5. Synthesize with Voice Profile
        6. Return Audio and status
        
        Returns: (processed_audio, status_update)
        """
        # PASSTHROUGH MODE: Send audio immediately without accumulation
        # Set to True for direct audio (no translation), False for full pipeline
        PASSTHROUGH_MODE = False
        
        if PASSTHROUGH_MODE:
            # In passthrough mode, send audio immediately for real-time communication
            pcm_audio = self._ensure_pcm16(audio_data)
            if len(pcm_audio) > 0:
                return pcm_audio, {"type": "STATUS", "status": "passthrough"}
            return None, None
        
        # Initialize buffers for this user if needed
        if user_id not in self.audio_buffers:
            self.audio_buffers[user_id] = b""
            self.silence_counters[user_id] = 0
        
        # Accumulate audio
        self.audio_buffers[user_id] += audio_data
        
        # Track silence
        if not vad_speaking:
            self.silence_counters[user_id] += 1
        else:
            self.silence_counters[user_id] = 0
        
        # Determine if we should process
        buffer_size = len(self.audio_buffers[user_id])
        should_process = False
        
        if buffer_size >= self.MAX_AUDIO_BYTES:
            # Buffer is full, must process
            should_process = True
            print(f"BUFFER FULL for {user_id}: {buffer_size} bytes")
        elif buffer_size >= self.MIN_AUDIO_BYTES and self.silence_counters[user_id] >= self.SILENCE_THRESHOLD:
            # Have enough audio and detected end of speech
            should_process = True
            print(f"END OF SPEECH for {user_id}: {buffer_size} bytes after {self.silence_counters[user_id]} silence chunks")
        
        if not should_process:
            # Keep accumulating
            return None, {"type": "STATUS", "status": "listening"}
        
        # Get accumulated audio and clear buffer
        accumulated_audio = self.audio_buffers[user_id]
        self.audio_buffers[user_id] = b""
        self.silence_counters[user_id] = 0
        
        # Step 1: Interruption Logic
        await self.interruption_handler.handle_audio_arrival(user_id, partner_id, True)
        
        # Step 2: Create task for processing to allow cancellation
        task = asyncio.create_task(self._run_pipeline(user_id, partner_id, accumulated_audio))
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
            
            # Calculate audio level for debugging
            import struct
            samples = struct.unpack(f'<{len(pcm_audio)//2}h', pcm_audio)
            max_sample = max(abs(s) for s in samples) if samples else 0
            avg_sample = sum(abs(s) for s in samples) / len(samples) if samples else 0
            
            print(f"AUDIO RECEIVED: {len(audio_data)} bytes, PCM: {len(pcm_audio)} bytes, max={max_sample}, avg={avg_sample:.0f}")
            
            if len(pcm_audio) < 1600:  # Less than 100ms of audio
                print(f"AUDIO TOO SHORT: {len(pcm_audio)} bytes")
                return None, None
            
            # Step 1: Detect language and transcribe
            print(f"DETECTING LANGUAGE for {user_id}...")
            detection_result = await self.language_detector.detect_language(pcm_audio)
            
            detected_language = detection_result["language_code"]
            transcript = detection_result["transcript"]
            confidence = detection_result["confidence"]
            
            print(f"DETECTION RESULT: lang={detected_language}, conf={confidence}, transcript='{transcript}'")
            
            if not transcript:
                # No transcript detected - could be silence, noise, or unclear speech
                # In passthrough mode, we would send the raw audio
                # For now, just skip and wait for clearer speech
                print(f"NO TRANSCRIPT DETECTED - skipping (confidence={confidence})")
                return None, {"type": "STATUS", "status": "listening"}
            
            # Accept any transcript with confidence > 0 (Google already filtered low confidence)
            if confidence < 0.01:
                print(f"VERY LOW CONFIDENCE ({confidence}) - skipping")
                return None, {"type": "STATUS", "status": "listening"}
            
            # Update user's DETECTED language (what they are speaking)
            self.detected_languages[user_id] = detected_language
            
            # Get partner's CHOSEN language (what they want to HEAR)
            # This is set from the JOIN message and should NOT change based on detection
            partner_language = self.user_languages.get(partner_id, "en-US")
            
            print(f"TRANSLATION: detected={detected_language} -> partner_chosen={partner_language}")
            
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
                print(f"NO PROCESSED TEXT - skipping synthesis")
                return None, status_update
            
            print(f"SYNTHESIZING: '{processed_text}' to {partner_language}")
            
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
                print(f"SYNTHESIS SUCCESS: {len(synthesized_audio)} bytes")
                status_update["transcript"] = transcript
                status_update["translated"] = processed_text
                return synthesized_audio, status_update
            else:
                print(f"SYNTHESIS FAILED - no audio returned")
                return None, status_update
                
        except Exception as e:
            print(f"Pipeline error: {e}")
            import traceback
            traceback.print_exc()
            return None, {"type": "ERROR", "message": str(e)}
    
    def _ensure_pcm16(self, audio_data: bytes) -> bytes:
        """
        Ensure audio is in PCM16 format.
        Frontend sends PCM16 directly (2 bytes per sample, little-endian).
        Just return the data as-is since it's already in the correct format.
        """
        # Frontend already sends PCM16 data, no conversion needed
        return audio_data
    
    def get_call_state(self) -> str:
        """Get current call state from interruption handler"""
        return self.interruption_handler.get_state().value
