"""
Voice Synthesis Module
Uses Google Cloud Text-to-Speech for voice resynthesis with speaker profiles
"""
import json
from google.cloud import texttospeech
from google.cloud import storage
from config import config

class VoiceSynthesizer:
    def __init__(self):
        self.tts_client = texttospeech.TextToSpeechClient()
        self.storage_client = storage.Client()
        
        # Default voice profiles per language
        # Using Journey/Wavenet voices for most natural sound
        # Format: language_code -> (voice_name, actual_language_code_for_tts)
        self.voice_mapping = {
            # English
            "en-US": ("en-US-Journey-D", "en-US"),
            "en-GB": ("en-GB-Journey-D", "en-GB"),
            "en-us": ("en-US-Journey-D", "en-US"),
            "en-gb": ("en-GB-Journey-D", "en-GB"),
            # French
            "fr-FR": ("fr-FR-Journey-D", "fr-FR"),
            "fr-fr": ("fr-FR-Journey-D", "fr-FR"),
            # Spanish
            "es-ES": ("es-ES-Journey-D", "es-ES"),
            "es-es": ("es-ES-Journey-D", "es-ES"),
            # Chinese (Mandarin)
            "zh-CN": ("cmn-CN-Wavenet-A", "cmn-CN"),
            "cmn-hans-cn": ("cmn-CN-Wavenet-A", "cmn-CN"),
            "cmn-CN": ("cmn-CN-Wavenet-A", "cmn-CN"),
            # Japanese
            "ja-JP": ("ja-JP-Wavenet-D", "ja-JP"),
            "ja-jp": ("ja-JP-Wavenet-D", "ja-JP"),
            # Korean
            "ko-KR": ("ko-KR-Wavenet-D", "ko-KR"),
            "ko-kr": ("ko-KR-Wavenet-D", "ko-KR"),
        }
        
        # Default voice profile settings
        self.default_profile = {
            "pitch_adjustment": 0.0,
            "tempo": 1.0,
        }
    
    async def load_voice_profile(self, profile_id: str) -> dict:
        """
        Load voice profile from Google Cloud Storage
        Returns pitch and tempo adjustments based on captured voice
        """
        if not profile_id or profile_id.startswith("local-"):
            return self.default_profile
            
        try:
            bucket = self.storage_client.bucket(config.GCS_BUCKET_NAME)
            blob = bucket.blob(f"profiles/{profile_id}.json")
            
            if blob.exists():
                content = blob.download_as_string()
                return json.loads(content)
            else:
                return self.default_profile
                
        except Exception as e:
            print(f"Error loading voice profile: {e}")
            return self.default_profile
    
    async def synthesize(
        self, 
        text: str, 
        language_code: str, 
        profile_id: str = None
    ) -> bytes:
        """
        Synthesize text to speech using Google Cloud TTS
        Applies voice profile adjustments for speaker matching
        
        Returns: PCM16 audio bytes at 16kHz
        """
        if not text or not text.strip():
            return b""
            
        try:
            # Load voice profile for pitch/tempo adjustments
            profile = await self.load_voice_profile(profile_id)
            
            # Get appropriate voice for language (voice_name, tts_language_code)
            voice_config = self.voice_mapping.get(language_code, self.voice_mapping.get(language_code.lower(), ("en-US-Journey-D", "en-US")))
            voice_name, tts_language_code = voice_config
            
            print(f"TTS: text='{text[:50]}...', lang={language_code}, voice={voice_name}, tts_lang={tts_language_code}")
            
            # Configure synthesis input
            synthesis_input = texttospeech.SynthesisInput(text=text)
            
            # Configure voice selection
            voice = texttospeech.VoiceSelectionParams(
                language_code=tts_language_code,
                name=voice_name,
            )
            
            # Configure audio output with profile adjustments
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16,
                speaking_rate=profile.get("tempo", 1.0),
                pitch=profile.get("pitch_adjustment", 0.0),
                sample_rate_hertz=16000,
            )
            
            # Perform synthesis
            response = self.tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            return response.audio_content
            
        except Exception as e:
            print(f"Voice synthesis error: {e}")
            return b""
    
    async def synthesize_with_ssml(
        self,
        text: str,
        language_code: str,
        emotion: str = "neutral",
        profile_id: str = None
    ) -> bytes:
        """
        Synthesize with SSML for better emotional expression
        """
        # Wrap text in SSML with prosody adjustments based on emotion
        emotion_prosody = {
            "excited": 'rate="fast" pitch="+2st"',
            "sad": 'rate="slow" pitch="-2st"',
            "angry": 'rate="fast" pitch="+1st" volume="loud"',
            "calm": 'rate="slow" pitch="-1st" volume="soft"',
            "neutral": 'rate="medium" pitch="0st"',
        }
        
        prosody = emotion_prosody.get(emotion, emotion_prosody["neutral"])
        ssml = f'<speak><prosody {prosody}>{text}</prosody></speak>'
        
        try:
            profile = await self.load_voice_profile(profile_id)
            voice_config = self.voice_mapping.get(language_code, self.voice_mapping.get(language_code.lower(), ("en-US-Journey-D", "en-US")))
            voice_name, tts_language_code = voice_config
            
            synthesis_input = texttospeech.SynthesisInput(ssml=ssml)
            
            voice = texttospeech.VoiceSelectionParams(
                language_code=tts_language_code,
                name=voice_name,
            )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16,
                speaking_rate=profile.get("tempo", 1.0),
                pitch=profile.get("pitch_adjustment", 0.0),
                sample_rate_hertz=16000,
            )
            
            response = self.tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            return response.audio_content
            
        except Exception as e:
            print(f"SSML synthesis error: {e}")
            return await self.synthesize(text, language_code, profile_id)
