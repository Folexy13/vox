"""
Language Detection Module
Uses Gemini 1.5 for audio transcription and language detection
"""
import base64
import google.generativeai as genai
from config import config

# Configure Gemini
genai.configure(api_key=config.GOOGLE_API_KEY)

class LanguageDetector:
    def __init__(self):
        # Use Gemini 1.5 Flash for faster audio processing
        self.model = genai.GenerativeModel('gemini-1.5-flash')
        
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
        
        self.language_names = {
            "en-US": "American English",
            "en-GB": "British English", 
            "en-NG": "Nigerian English",
            "fr-FR": "French",
            "es-ES": "Spanish",
            "yo-NG": "Yoruba",
            "ig-NG": "Igbo",
            "ha-NG": "Hausa",
            "ar-SA": "Arabic",
            "zh-CN": "Mandarin Chinese",
        }
        
    async def detect_language(self, audio_data: bytes, sample_rate: int = 16000) -> dict:
        """
        Detect language and transcribe audio using Gemini 1.5
        Returns: {
            "language_code": str,
            "confidence": float,
            "transcript": str
        }
        """
        try:
            # Convert PCM16 audio to base64 for Gemini
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
            
            # Create audio part for Gemini
            audio_part = {
                "inline_data": {
                    "mime_type": "audio/pcm",
                    "data": audio_base64
                }
            }
            
            prompt = """Listen to this audio and:
1. Transcribe exactly what is said
2. Detect the language being spoken

Respond in this exact JSON format only, no other text:
{"language": "en-US", "transcript": "the transcribed text here"}

Use these language codes:
- en-US for American English
- en-GB for British English
- en-NG for Nigerian English
- fr-FR for French
- es-ES for Spanish
- yo-NG for Yoruba
- ig-NG for Igbo
- ha-NG for Hausa
- ar-SA for Arabic
- zh-CN for Mandarin Chinese

If you cannot understand the audio or it's silence, respond with:
{"language": "unknown", "transcript": ""}"""

            response = await self.model.generate_content_async([prompt, audio_part])
            response_text = response.text.strip()
            
            # Parse JSON response
            import json
            try:
                # Clean up response if needed
                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                if response_text.startswith("```"):
                    response_text = response_text[3:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]
                response_text = response_text.strip()
                
                result = json.loads(response_text)
                language = result.get("language", "en-US")
                transcript = result.get("transcript", "")
                
                if language == "unknown" or not transcript:
                    return {
                        "language_code": "en-US",
                        "confidence": 0.0,
                        "transcript": ""
                    }
                
                return {
                    "language_code": language,
                    "confidence": 0.9,  # Gemini doesn't provide confidence, assume high
                    "transcript": transcript
                }
                
            except json.JSONDecodeError:
                print(f"Failed to parse Gemini response: {response_text}")
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
