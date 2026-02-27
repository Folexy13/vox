"""
Language Detection Module
Uses Google Cloud Speech-to-Text for language detection from audio chunks
"""
import os
from google.cloud import speech
from config import config

class LanguageDetector:
    def __init__(self):
        self.client = speech.SpeechClient()
        # Supported languages with their codes
        self.supported_languages = [
            "en-US", "en-GB", "en-NG",  # English variants
            "fr-FR",  # French
            "es-ES",  # Spanish
            "yo-NG",  # Yoruba
            "ig-NG",  # Igbo
            "ha-NG",  # Hausa
            "ar-SA",  # Arabic
            "zh-CN",  # Mandarin
        ]
        
    async def detect_language(self, audio_data: bytes, sample_rate: int = 16000) -> dict:
        """
        Detect language from audio chunk using Google Cloud Speech-to-Text
        Returns: {
            "language_code": str,
            "confidence": float,
            "transcript": str
        }
        """
        try:
            audio = speech.RecognitionAudio(content=audio_data)
            
            # Configure for language detection with multiple alternatives
            config_obj = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=sample_rate,
                language_code="en-US",  # Primary language
                alternative_language_codes=self.supported_languages[1:],  # Alternatives
                enable_automatic_punctuation=True,
            )
            
            response = self.client.recognize(config=config_obj, audio=audio)
            
            if response.results:
                result = response.results[0]
                if result.alternatives:
                    alternative = result.alternatives[0]
                    # Get detected language from result
                    detected_language = getattr(result, 'language_code', 'en-US')
                    return {
                        "language_code": detected_language,
                        "confidence": alternative.confidence,
                        "transcript": alternative.transcript
                    }
            
            return {
                "language_code": "en-US",
                "confidence": 0.0,
                "transcript": ""
            }
            
        except Exception as e:
            print(f"Language detection error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "language_code": "en-US",
                "confidence": 0.0,
                "transcript": ""
            }
    
    def are_same_language(self, lang1: str, lang2: str) -> bool:
        """
        Check if two language codes represent the same base language
        e.g., en-US and en-GB are both English
        """
        base1 = lang1.split("-")[0] if lang1 else ""
        base2 = lang2.split("-")[0] if lang2 else ""
        return base1 == base2
