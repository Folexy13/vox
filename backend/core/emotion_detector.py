"""
Emotion Detection Module
Uses Gemini to detect emotional tone from text for emotion-aware translation
"""
import os
import google.generativeai as genai
from typing import Dict, Optional, Tuple
from config import config

# Configure Gemini
genai.configure(api_key=config.GOOGLE_API_KEY)


class EmotionDetector:
    """
    Detects emotional tone from transcribed text using Gemini.
    This enables emotion-aware translation that preserves the speaker's
    emotional state in the translated output.
    """
    
    def __init__(self):
        # Use gemini-3-flash-preview - latest and smartest fast model
        self.model = genai.GenerativeModel('gemini-3-flash-preview')
        
        # Emotion categories with their characteristics
        self.emotions = {
            "happy": {"emoji": "😊", "prosody": "upbeat", "description": "Joyful, pleased, content"},
            "excited": {"emoji": "🎉", "prosody": "energetic", "description": "Enthusiastic, eager, thrilled"},
            "sad": {"emoji": "😢", "prosody": "slow", "description": "Unhappy, disappointed, melancholic"},
            "angry": {"emoji": "😤", "prosody": "intense", "description": "Frustrated, irritated, upset"},
            "frustrated": {"emoji": "😤", "prosody": "tense", "description": "Annoyed, exasperated, stuck"},
            "confused": {"emoji": "🤔", "prosody": "uncertain", "description": "Puzzled, unsure, questioning"},
            "neutral": {"emoji": "😐", "prosody": "normal", "description": "Calm, matter-of-fact, balanced"},
            "calm": {"emoji": "😌", "prosody": "relaxed", "description": "Peaceful, serene, composed"},
            "surprised": {"emoji": "😲", "prosody": "sudden", "description": "Astonished, amazed, startled"},
            "worried": {"emoji": "😟", "prosody": "anxious", "description": "Concerned, nervous, apprehensive"},
        }
        
        # Detection prompt
        self.detection_prompt = """Analyze the emotional tone of the following text.
        
Text: "{text}"

Respond with ONLY one of these emotions (lowercase, single word):
- happy (joyful, pleased, content)
- excited (enthusiastic, eager, thrilled)
- sad (unhappy, disappointed, melancholic)
- angry (frustrated, irritated, upset)
- frustrated (annoyed, exasperated)
- confused (puzzled, unsure, questioning)
- neutral (calm, matter-of-fact)
- calm (peaceful, serene)
- surprised (astonished, amazed)
- worried (concerned, nervous)

Just respond with the single emotion word, nothing else."""

    async def detect_emotion(self, text: str) -> Dict:
        """
        Detect the emotional tone of the given text.
        
        Args:
            text: The transcribed text to analyze
            
        Returns:
            Dict with emotion, emoji, prosody hint, and confidence
        """
        if not text or len(text.strip()) < 3:
            return self._get_default_emotion()
            
        try:
            prompt = self.detection_prompt.format(text=text)
            
            response = await self.model.generate_content_async(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,  # Low temperature for consistent results
                    max_output_tokens=20,
                )
            )
            
            if response and response.text:
                detected = response.text.strip().lower()
                
                # Validate the emotion
                if detected in self.emotions:
                    emotion_data = self.emotions[detected]
                    return {
                        "emotion": detected,
                        "emoji": emotion_data["emoji"],
                        "prosody": emotion_data["prosody"],
                        "description": emotion_data["description"],
                        "confidence": 0.85,  # Gemini doesn't provide confidence, use default
                    }
                else:
                    # Try to match partial response
                    for emotion in self.emotions:
                        if emotion in detected:
                            emotion_data = self.emotions[emotion]
                            return {
                                "emotion": emotion,
                                "emoji": emotion_data["emoji"],
                                "prosody": emotion_data["prosody"],
                                "description": emotion_data["description"],
                                "confidence": 0.7,
                            }
            
            return self._get_default_emotion()
            
        except Exception as e:
            print(f"Emotion detection error: {e}")
            return self._get_default_emotion()
    
    def _get_default_emotion(self) -> Dict:
        """Return default neutral emotion"""
        return {
            "emotion": "neutral",
            "emoji": "😐",
            "prosody": "normal",
            "description": "Calm, matter-of-fact, balanced",
            "confidence": 0.5,
        }
    
    async def detect_and_translate_with_emotion(
        self, 
        text: str, 
        source_language: str, 
        target_language: str
    ) -> Tuple[str, Dict]:
        """
        Detect emotion and translate while preserving emotional tone.
        
        Args:
            text: Original text
            source_language: Source language code
            target_language: Target language code
            
        Returns:
            Tuple of (translated_text, emotion_data)
        """
        # First detect emotion
        emotion_data = await self.detect_emotion(text)
        
        # Then translate with emotion context
        translation_prompt = f"""You are a real-time interpreter preserving not just meaning
but emotional tone, cultural register, humor, and personal style.

The speaker's emotional state is: {emotion_data['emotion']} ({emotion_data['description']})

Translate the following from {source_language} to {target_language}.

Rules:
- Preserve the speaker's {emotion_data['emotion']} emotional state exactly
- Use natural spoken language, not formal written language
- Preserve idioms by finding equivalent idioms in target language
- If something cannot be translated without losing meaning, prioritize meaning over literalism
- The translation should FEEL {emotion_data['emotion']} when read aloud
- Return ONLY the translated text, nothing else

Text to translate: {text}"""

        try:
            print(f"EMOTION TRANSLATION: {source_language} -> {target_language}")
            print(f"EMOTION TRANSLATION INPUT: '{text}'")
            
            response = await self.model.generate_content_async(
                translation_prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=500,
                )
            )
            
            if response and response.text:
                translated = response.text.strip()
                print(f"EMOTION TRANSLATION OUTPUT: '{translated}'")
                emotion_data["emotionPreserved"] = True
                return translated, emotion_data
            else:
                print(f"EMOTION TRANSLATION: No response from Gemini")
                return text, emotion_data
                
        except Exception as e:
            print(f"Emotion-aware translation error: {e}")
            import traceback
            traceback.print_exc()
            return text, emotion_data
    
    def get_prosody_for_tts(self, emotion: str) -> Dict:
        """
        Get TTS prosody parameters based on detected emotion.
        
        Returns dict with rate, pitch, and volume adjustments for SSML.
        """
        prosody_map = {
            "happy": {"rate": "medium", "pitch": "+2st", "volume": "medium"},
            "excited": {"rate": "fast", "pitch": "+3st", "volume": "loud"},
            "sad": {"rate": "slow", "pitch": "-2st", "volume": "soft"},
            "angry": {"rate": "fast", "pitch": "+1st", "volume": "loud"},
            "frustrated": {"rate": "medium", "pitch": "+1st", "volume": "medium"},
            "confused": {"rate": "slow", "pitch": "0st", "volume": "medium"},
            "neutral": {"rate": "medium", "pitch": "0st", "volume": "medium"},
            "calm": {"rate": "slow", "pitch": "-1st", "volume": "soft"},
            "surprised": {"rate": "fast", "pitch": "+2st", "volume": "loud"},
            "worried": {"rate": "medium", "pitch": "+1st", "volume": "soft"},
        }
        
        return prosody_map.get(emotion, prosody_map["neutral"])
    
    def get_emotion_emoji(self, emotion: str) -> str:
        """Get emoji for an emotion"""
        if emotion in self.emotions:
            return self.emotions[emotion]["emoji"]
        return "💬"
