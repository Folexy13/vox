"""
Real-time Translation Module
Uses Gemini API for context-aware, emotion-preserving translation
"""
import os
import google.generativeai as genai
from config import config

# Configure Gemini
genai.configure(api_key=config.GOOGLE_API_KEY)

class Translator:
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Language name mapping for prompts
        # Only languages with good TTS support
        self.language_names = {
            "en-US": "American English",
            "en-GB": "British English",
            "en-us": "American English",
            "en-gb": "British English",
            "fr-FR": "French",
            "fr-fr": "French",
            "es-ES": "Spanish",
            "es-es": "Spanish",
            "zh-CN": "Mandarin Chinese",
            "cmn-hans-cn": "Mandarin Chinese",
            "ja-JP": "Japanese",
            "ja-jp": "Japanese",
            "ko-KR": "Korean",
            "ko-kr": "Korean",
        }
    
    async def translate(self, text: str, source_language: str, target_language: str) -> str:
        """
        Translate text from source language to target language
        Preserves emotional tone, cultural register, and natural speech patterns
        """
        if not text or not text.strip():
            return ""
            
        source_name = self.language_names.get(source_language, source_language)
        target_name = self.language_names.get(target_language, target_language)
        
        prompt = f"""TASK: Translate this speech from {source_name} to {target_name}.

INPUT: "{text}"

RULES:
1. Output ONLY the translation, nothing else
2. Do NOT answer questions - just translate them
3. Do NOT add explanations or commentary
4. Preserve emotional tone and natural speech patterns
5. If the input is a question, output the question translated (not an answer)

OUTPUT (translation only):"""

        try:
            response = await self.model.generate_content_async(prompt)
            translated_text = response.text.strip()
            
            # Remove any quotes that might have been added
            if translated_text.startswith('"') and translated_text.endswith('"'):
                translated_text = translated_text[1:-1]
            if translated_text.startswith("'") and translated_text.endswith("'"):
                translated_text = translated_text[1:-1]
                
            return translated_text
            
        except Exception as e:
            print(f"Translation error: {e}")
            return text  # Return original text on error
    
    async def clarify_accent(self, text: str, source_accent: str, target_accent: str) -> str:
        """
        For same-language scenarios, clarify accent/dialect differences
        e.g., Nigerian English to British English
        """
        if not text or not text.strip():
            return ""
            
        source_name = self.language_names.get(source_accent, source_accent)
        target_name = self.language_names.get(target_accent, target_accent)
        
        prompt = f"""You are helping clarify speech between two speakers of the same language
but with different accents/dialects.

The speaker uses {source_name}. The listener understands {target_name}.

Rephrase the following to be clearer for the listener while preserving:
- The exact meaning and intent
- The emotional tone
- Natural conversational style

Only make changes if there are dialect-specific words or phrases that might cause confusion.
If the text is already clear, return it unchanged.

Return ONLY the clarified text, nothing else.

Text: {text}"""

        try:
            response = await self.model.generate_content_async(prompt)
            clarified_text = response.text.strip()
            
            # Remove any quotes
            if clarified_text.startswith('"') and clarified_text.endswith('"'):
                clarified_text = clarified_text[1:-1]
            if clarified_text.startswith("'") and clarified_text.endswith("'"):
                clarified_text = clarified_text[1:-1]
                
            return clarified_text
            
        except Exception as e:
            print(f"Accent clarification error: {e}")
            return text
