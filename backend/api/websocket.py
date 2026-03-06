import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService, InputParams, GeminiModalities, GeminiVADParams
from google.genai.types import ThinkingConfig
from pipecat.audio.filters.rnnoise_filter import RNNoiseFilter
from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
from pipecat.services.cartesia import CartesiaTTSService
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.frames.frames import TTSAudioRawFrame, TextFrame, LLMFullResponseEndFrame, InputAudioRawFrame, TranscriptionFrame, LLMMessagesAppendFrame
from pipecat.serializers.base_serializer import FrameSerializer
import json

router = APIRouter()

# Simple in-memory room storage: room_id -> {user_id: websocket, task: PipelineTask, ...}
ROOMS = {}

class RawBinarySerializer(FrameSerializer):
    def __init__(self, room_id: str, user_id: str):
        super().__init__()
        self.room_id = room_id
        self.user_id = user_id

    async def deserialize(self, data: bytes | str):
        if isinstance(data, bytes):
            # Frontend sends 16kHz 16-bit PCM Int16
            return InputAudioRawFrame(audio=data, num_channels=1, sample_rate=16000)
        elif isinstance(data, str):
            try:
                msg = json.loads(data)
                if msg.get("type") == "LANGUAGE_UPDATE":
                    new_lang = msg.get("language")
                    logger.info(f"User {self.user_id} changed language to {new_lang}")
                    
                    if self.room_id in ROOMS and self.user_id in ROOMS[self.room_id]:
                        ROOMS[self.room_id][self.user_id]["language"] = new_lang
                        
                    # Tell the partner's pipeline to update target language
                    room = ROOMS.get(self.room_id, {})
                    for uid, user_data in room.items():
                        if uid != self.user_id and "task" in user_data:
                            prompt_update = LLMMessagesAppendFrame([
                                {"role": "system", "content": f"System update: The target language is now {new_lang}. DO NOT acknowledge this update. DO NOT re-translate previous sentences. Silently apply this new language to all future translations."}
                            ])
                            await user_data["task"].queue_frame(prompt_update)
            except Exception as e:
                logger.error(f"JSON intercept error: {e}")
        return None
    
    async def serialize(self, frame):
        if isinstance(frame, TTSAudioRawFrame):
            return frame.audio
        return None

import audioop

class DropGeminiAudioProcessor(FrameProcessor):
    def __init__(self, room_id: str, user_id: str):
        super().__init__()
        self.room_id = room_id
        self.user_id = user_id

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, TTSAudioRawFrame):
            # Drop Gemini's native audio so only Cartesia's audio plays
            return
        
        await self.push_frame(frame, direction)

class RouteToPartnerProcessor(FrameProcessor):
    def __init__(self, room_id: str, user_id: str):
        super().__init__()
        self.room_id = room_id
        self.user_id = user_id
        self.current_text = ""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, TTSAudioRawFrame):
            # Send audio directly to partner(s) in the room
            room = ROOMS.get(self.room_id, {})
            for uid, user_data in room.items():
                if uid != self.user_id:
                    try:
                        await user_data["websocket"].send_bytes(frame.audio)
                    except Exception as e:
                        logger.error(f"Failed to route audio to {uid}: {e}")
            # DO NOT yield TTS audio downstream so the speaker doesn't hear themselves
            return
            
        elif isinstance(frame, TranscriptionFrame):
            # Send the original text to the speaker immediately (only finalized)
            if getattr(frame, "finalized", True):
                room = ROOMS.get(self.room_id, {})
                user_data = room.get(self.user_id)
                if user_data and frame.text.strip():
                    try:
                        await user_data["websocket"].send_json({
                            "type": "TRANSCRIPT",
                            "original": frame.text,
                            "translated": "",
                            "isUser": True,
                            "sourceLanguage": "auto",
                            "targetLanguage": "auto",
                            "confidence": 1.0,
                            "emotionPreserved": True
                        })
                    except Exception as e:
                        pass
                        
        elif isinstance(frame, TextFrame):
            # Check if Gemini is sending cumulative text instead of deltas
            if frame.text.startswith(self.current_text) and len(self.current_text) > 0:
                delta = frame.text[len(self.current_text):]
                self.current_text = frame.text
            else:
                self.current_text += frame.text
            
        elif isinstance(frame, LLMFullResponseEndFrame):
            if self.current_text.strip():
                room = ROOMS.get(self.room_id, {})
                for uid, user_data in room.items():
                    if uid != self.user_id:
                        try:
                            await user_data["websocket"].send_json({
                                "type": "TRANSCRIPT",
                                "original": "", 
                                "translated": self.current_text.strip(),
                                "isUser": False,
                                "sourceLanguage": "auto",
                                "targetLanguage": "auto",
                                "confidence": 1.0,
                                "emotionPreserved": True
                            })
                        except Exception:
                            pass
                self.current_text = ""

        await self.push_frame(frame, direction)


@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    logger.info(f"User {user_id} joined room {room_id} over Pipecat WebSocket")

    # Read the initial JOIN JSON message from frontend
    user_name = "Guest"
    user_lang = "en-US"
    profile_id = "e07c00bc-4134-4eae-9ea4-1a55fb45746b" # Actual valid Cartesia fallback voice (Brooke)
    
    try:
        # Wait up to 2 seconds for the JOIN message
        data = await asyncio.wait_for(websocket.receive_json(), timeout=2.0)
        if data.get("type") == "JOIN":
            user_name = data.get("username", "Guest")
            user_lang = data.get("language", "en-US")
            if data.get("profileId"):
                profile_id = data.get("profileId")
    except Exception as e:
        logger.warning(f"Could not receive JOIN message: {e}")

    if room_id not in ROOMS:
        ROOMS[room_id] = {}
        
    ROOMS[room_id][user_id] = {
        "websocket": websocket,
        "name": user_name,
        "language": user_lang,
        "profile_id": profile_id
    }

    # Find partner if they exist
    partner_data = next((u for k, u in ROOMS[room_id].items() if k != user_id), None)
    target_language = partner_data["language"] if partner_data else "their partner's language"

    # When a second person joins, send READY signal to both with actual names
    if len(ROOMS[room_id]) == 2:
        users = list(ROOMS[room_id].values())
        for uid, user_dict in ROOMS[room_id].items():
            ws = user_dict["websocket"]
            # Find the other user's data
            other_data = next((u for k, u in ROOMS[room_id].items() if k != uid), None)
            if other_data:
                try:
                    await ws.send_json({
                        "type": "READY", 
                        "partnerName": other_data["name"], 
                        "partnerLanguage": other_data["language"]
                    })
                except:
                    pass

    try:
        # Transport receives audio from this user but doesn't output back to them (audio_out_enabled=False)
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_in_filter=RNNoiseFilter(), # Clear speech
                audio_out_enabled=False,
                add_wav_header=False,
                vad_analyzer=SileroVADAnalyzer(),
                serializer=RawBinarySerializer(room_id, user_id)
            )
        )
        
        use_cartesia = os.getenv("USE_CARTESIA", "false").lower() == "true"

        # Determine Gemini's internal parameters for ultra low latency
        gemini_params = InputParams(
            thinking=ThinkingConfig(thinking_budget=0), # Removes latency
            vad=GeminiVADParams(
                prefix_padding_ms=150,
                silence_duration_ms=300 # Super fast response
            )
        )
        if use_cartesia:
            gemini_params.modalities = GeminiModalities.TEXT

        llm_service = GeminiLiveLLMService(
            api_key=os.getenv("GOOGLE_API_KEY", ""),
            model="gemini-2.5-flash-native-audio-latest",
            voice_id="Puck", # Puck is faster and highly expressive/natural
            system_instruction=(
                f"You are Vox, a helpful and natural conversational translator. "
                f"Listen to the user, identify their language, and smoothly translate what they just said into {target_language}. "
                f"Speak at a brisk, natural human pace. Do not sound robotic. "
                f"ONLY output the translated message in {target_language}. Do not summarize, do not add introductory phrases, just speak the translation naturally and quickly."
            ),
            params=gemini_params
        )

        router_processor = RouteToPartnerProcessor(room_id, user_id)

        if use_cartesia:
            # Cartesia TTS setup for ultra-fast, high-quality voice cloning
            tts_service = CartesiaTTSService(
                api_key=os.getenv("CARTESIA_API_KEY", "sk_car_C6yXsTuvARZqLQyeHuRK8z"),
                voice_id=profile_id,
                sample_rate=24000,
                aggregate_sentences=False
            )
            pipeline = Pipeline([
                transport.input(),
                llm_service,
                DropGeminiAudioProcessor(room_id, user_id),
                tts_service,
                router_processor,
                transport.output()
            ])
        else:
            # Gemini Native Audio Pipeline (Ultra-low latency, bypass Cartesia)
            pipeline = Pipeline([
                transport.input(),
                llm_service,
                # No Cartesia or Audio Dropper needed
                router_processor,
                transport.output()
            ])

        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=False, # Disable interruptions so Gemini doesn't cut itself off
                enable_metrics=True,
                send_initial_empty_metrics=False
            )
        )
        
        # Store the task in ROOMS so the JSON interceptor can push LLMMessagesAppendFrame if language changes
        ROOMS[room_id][user_id]["task"] = task

        runner = PipelineRunner()
        await runner.run(task)

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from room {room_id}")
        if room_id in ROOMS and user_id in ROOMS[room_id]:
            del ROOMS[room_id][user_id]
            for uid, user_data in ROOMS[room_id].items():
                try:
                    await user_data["websocket"].send_json({"type": "PARTNER_LEFT"})
                except:
                    pass
    except Exception as e:
        logger.error(f"Error in pipecat pipeline for user {user_id}: {e}")
