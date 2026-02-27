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
        self.model = genai.GenerativeModel('gemini-pro')
        
        # Language name mapping for prompts
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
    
    async def translate(self, text: str, source_language: str, target_language: str) -> str:
        """
        Translate text from source language to target language
        Preserves emotional tone, cultural register, and natural speech patterns
        """
        if not text or not text.strip():
            return ""
            
        source_name = self.language_names.get(source_language, source_language)
        target_name = self.language_names.get(target_language, target_language)
        
        prompt = f"""You are a real-time interpreter preserving not just meaning
but emotional tone, cultural register, humor, and personal style.

Translate the following from {source_name} to {target_name}.

Rules:
- Preserve the speaker's emotional state exactly
- Use natural spoken language, not formal written language
- Preserve idioms by finding equivalent idioms in target language
- If something cannot be translated without losing meaning, prioritize meaning over literalism
- Return ONLY the translated text, nothing else

Text to translate: {text}"""

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
