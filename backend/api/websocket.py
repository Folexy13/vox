import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner
from pipecat.audio.vad.silero import SileroVADAnalyzer, VADParams
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService, InputParams, GeminiModalities, GeminiVADParams
from google.genai.types import ThinkingConfig
from pipecat.audio.filters.rnnoise_filter import RNNoiseFilter
from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
from pipecat.services.cartesia import CartesiaTTSService
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.frames.frames import TTSAudioRawFrame, OutputAudioRawFrame, TextFrame, LLMFullResponseEndFrame, InputAudioRawFrame, TranscriptionFrame, LLMMessagesAppendFrame, CancelTaskFrame
from pipecat.serializers.base_serializer import FrameSerializer
import json
import audioop

router = APIRouter()

# Simple in-memory room storage: room_id -> {user_id: websocket, task: PipelineTask, ...}
ROOMS = {}

class RawBinarySerializer(FrameSerializer):
    def __init__(self, room_id: str, user_id: str, resample_to_16k: bool = False):
        super().__init__()
        self.room_id = room_id
        self.user_id = user_id
        self.ratecv_state = None
        self.resample_to_16k = resample_to_16k

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
                        
                    # For Agent room, restart OWN pipeline. For Call room, restart PARTNER pipeline.
                    room = ROOMS.get(self.room_id, {})
                    if self.room_id == "agent_room":
                        if self.user_id in room and "task" in room[self.user_id]:
                            asyncio.create_task(room[self.user_id]["task"].queue_frame(CancelTaskFrame()))
                    else:
                        for uid, user_data in room.items():
                            if uid != self.user_id and "task" in user_data:
                                asyncio.create_task(user_data["task"].queue_frame(CancelTaskFrame()))
            except Exception as e:
                logger.error(f"JSON intercept error: {e}")
        return None
    
    async def serialize(self, frame):
        # Handle both TTSAudioRawFrame (from TTS services) and OutputAudioRawFrame (from Gemini Live native audio)
        if isinstance(frame, (TTSAudioRawFrame, OutputAudioRawFrame)):
            audio_data = frame.audio
            # For agent mode, we send at native 24kHz since frontend plays at 24kHz
            # For meeting mode, RouteToPartnerProcessor handles resampling before this point
            return audio_data
        return None

class DropGeminiAudioProcessor(FrameProcessor):
    def __init__(self, room_id: str, user_id: str):
        super().__init__()
        self.room_id = room_id
        self.user_id = user_id

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, (TTSAudioRawFrame, OutputAudioRawFrame)):
            # Drop Gemini's native audio so only Cartesia's audio plays
            return
        
        await self.push_frame(frame, direction)

class AgentTranscriptProcessor(FrameProcessor):
    def __init__(self, websocket: WebSocket):
        super().__init__()
        self.websocket = websocket
        self.current_text = ""
        self.last_text_chunk = None

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, TranscriptionFrame):
            text_said = frame.text.strip()
            if text_said and getattr(frame, 'finalized', True):
                try:
                    await self.websocket.send_json({
                        "type": "TRANSCRIPT",
                        "original": text_said,
                        "translated": "",
                        "isUser": True,
                        "sourceLanguage": "auto",
                        "targetLanguage": "auto",
                        "confidence": 1.0,
                        "emotionPreserved": True
                    })
                except:
                    pass
                    
        elif isinstance(frame, TextFrame):
            if frame.text != self.last_text_chunk:
                self.current_text += frame.text
                self.last_text_chunk = frame.text
                
        elif isinstance(frame, LLMFullResponseEndFrame):
            final_text = self.current_text.strip()
            if final_text:
                try:
                    await self.websocket.send_json({
                        "type": "TRANSCRIPT",
                        "original": "",
                        "translated": final_text,
                        "isUser": False,
                        "sourceLanguage": "auto",
                        "targetLanguage": "auto",
                        "confidence": 1.0,
                        "emotionPreserved": True
                    })
                except:
                    pass
                self.current_text = ""
                self.last_text_chunk = None
                
        await self.push_frame(frame, direction)


class RouteToPartnerProcessor(FrameProcessor):
    def __init__(self, room_id: str, user_id: str):
        super().__init__()
        self.room_id = room_id
        self.user_id = user_id
        self.current_text = ""
        self.ratecv_state = None
        self.last_text_chunk = None

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        # Handle both TTSAudioRawFrame and OutputAudioRawFrame (Gemini Live native audio)
        if isinstance(frame, (TTSAudioRawFrame, OutputAudioRawFrame)):
            audio_to_send = frame.audio
            # If audio is not 16kHz (like Gemini's default 24kHz), we MUST resample
            if getattr(frame, "sample_rate", 24000) != 16000:
                try:
                    audio_to_send, self.ratecv_state = audioop.ratecv(
                        frame.audio, 2, 1, getattr(frame, "sample_rate", 24000), 16000, self.ratecv_state
                    )
                except Exception as e:
                    logger.error(f"Resampling error: {e}")

            # Send audio directly to partner(s) in the room
            room = ROOMS.get(self.room_id, {})
            for uid, user_data in room.items():
                if uid != self.user_id:
                    try:
                        await user_data["websocket"].send_bytes(audio_to_send)
                    except Exception as e:
                        logger.error(f"Failed to route audio to {uid}: {e}")
            # DO NOT yield TTS audio downstream so the speaker doesn't hear themselves
            return
            
        elif isinstance(frame, TranscriptionFrame):
            # Send the original text to the speaker immediately
            text_said = frame.text.strip()
            if text_said:
                logger.info(f"🗣️ [User {self.user_id} says] (final={getattr(frame, 'finalized', True)}): {text_said}")
                if getattr(frame, 'finalized', True):
                    room = ROOMS.get(self.room_id, {})
                    user_data = room.get(self.user_id)
                    if user_data:
                        try:
                            await user_data["websocket"].send_json({
                                "type": "TRANSCRIPT",
                                "original": text_said,
                                "translated": "",
                                "isUser": True,
                                "sourceLanguage": "auto",
                                "targetLanguage": "auto",
                                "confidence": 1.0,
                                "emotionPreserved": True
                            })
                        except Exception as e:
                            logger.error(f"Error sending transcription to speaker: {e}")
                        
        elif isinstance(frame, TextFrame):
            # Pipecat 0.0.104 Gemini implementation has a known bug where it emits
            # duplicate TextFrames in a row. We filter out exact consecutive duplicates here.
            if frame.text != self.last_text_chunk:
                self.current_text += frame.text
                self.last_text_chunk = frame.text
            
        elif isinstance(frame, LLMFullResponseEndFrame):
            final_translation = self.current_text.strip()
            if final_translation:
                logger.info(f"🎧 [Partner hears from User {self.user_id}]: {final_translation}")
                room = ROOMS.get(self.room_id, {})
                for uid, user_data in room.items():
                    if uid != self.user_id:
                        try:
                            await user_data["websocket"].send_json({
                                "type": "TRANSCRIPT",
                                "original": "",
                                "translated": final_translation,
                                "isUser": False,
                                "sourceLanguage": "auto",
                                "targetLanguage": "auto",
                                "confidence": 1.0,
                                "emotionPreserved": True
                            })
                        except Exception:
                            pass
                self.current_text = ""
                self.last_text_chunk = None

        await self.push_frame(frame, direction)


@router.websocket("/ws/agent/{user_id}")
async def agent_websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    logger.info(f"User {user_id} started an Agent session")

    user_name = "Guest"
    user_lang = "en-US"
    try:
        # Wait for the initial JOIN message BEFORE Pipecat takes over the websocket.
        data = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        if data.get("type") == "JOIN":
            user_name = data.get("username", "Guest")
            user_lang = data.get("language", "en-US")
    except Exception as e:
        logger.warning(f"Could not receive JOIN message: {e}")

    # Register the agent user
    ROOMS["agent_room"] = ROOMS.get("agent_room", {})
    ROOMS["agent_room"][user_id] = {
        "websocket": websocket,
        "name": user_name,
        "language": user_lang,
        "last_user_speech": asyncio.get_event_loop().time(),  # Track last user speech
        "inactivity_prompts": 0,  # Count of inactivity prompts sent
        "is_active": True  # Flag to control inactivity checker
    }

    try:
        # Transport handles all websocket reading
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_in_filter=RNNoiseFilter(),
                audio_out_enabled=True,
                add_wav_header=False,
                vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.45, stop_secs=0.8)),
                serializer=RawBinarySerializer("agent_room", user_id)
            )
        )

        while True:
            # Re-read settings dynamically
            current_user_data = ROOMS["agent_room"].get(user_id, {})
            current_name = current_user_data.get("name", "Guest")
            current_lang = current_user_data.get("language", "en-US")
            
            LANGUAGE_MAP = {
                "en-US": "American English",
                "en-GB": "British English",
                "en-NG": "Nigerian English",
                "fr-FR": "French",
                "es-ES": "Spanish",
                "pt-BR": "Portuguese",
                "de-DE": "German",
                "yo-NG": "Yoruba",
                "ig-NG": "Igbo",
                "ha-NG": "Hausa"
            }
            lang_name = LANGUAGE_MAP.get(current_lang, current_lang)

            llm_service = GeminiLiveLLMService(
                api_key=os.getenv("GOOGLE_API_KEY", ""),
                model="gemini-2.5-flash-native-audio-latest",
                voice_id="Puck",
                system_instruction=(
                    f"You are Voxa, a highly intelligent, deeply empathetic, and inspiring AI companion. "
                    f"You MUST speak strictly in {lang_name} for this entire conversation. "
                    f"You are talking to a user. "
                    f"Your goal is to have a deeply engaging, profoundly human-like conversation. "
                    f"When the user tells you their name, remember it and use it warmly in the conversation. "
                    f"Then ask them what you can do for them today. "
                    f"If they discuss life issues, offer wise, grounded, and emotionally intelligent advice. "
                    f"If they lack motivation, be powerfully inspiring and uplift them. "
                    f"Act exactly like a brilliant mentor and friend talking on a late-night phone call. "
                    f"Keep your responses naturally paced, insightful, and warmly conversational. "
                    f"Never break character. Never act robotic."
                ),
                params=InputParams(
                    thinking=ThinkingConfig(thinking_budget=0),
                    vad=GeminiVADParams(prefix_padding_ms=150, silence_duration_ms=700)
                )
            )

            agent_transcript = AgentTranscriptProcessor(websocket)
            pipeline = Pipeline([transport.input(), llm_service, agent_transcript, transport.output()])
            task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True, enable_metrics=False))
            
            ROOMS["agent_room"][user_id]["task"] = task
            runner = PipelineRunner()
            
            # Track if we've sent READY and greeting
            ready_sent = False
            greeting_sent = False
            
            # Inactivity check task
            inactivity_task = None
            
            async def check_inactivity():
                """Check for user inactivity and prompt or end call"""
                INACTIVITY_TIMEOUT = 120  # 2 minutes
                MAX_PROMPTS = 3
                
                while ROOMS.get("agent_room", {}).get(user_id, {}).get("is_active", False):
                    await asyncio.sleep(10)  # Check every 10 seconds
                    
                    user_data = ROOMS.get("agent_room", {}).get(user_id, {})
                    if not user_data.get("is_active", False):
                        break
                    
                    last_speech = user_data.get("last_user_speech", 0)
                    current_time = asyncio.get_event_loop().time()
                    time_since_speech = current_time - last_speech
                    
                    if time_since_speech >= INACTIVITY_TIMEOUT:
                        prompts_sent = user_data.get("inactivity_prompts", 0)
                        
                        if prompts_sent >= MAX_PROMPTS:
                            # End the call after 3 prompts with no response
                            logger.info(f"Ending call for {user_id} due to inactivity (6 minutes)")
                            try:
                                await websocket.send_json({
                                    "type": "CALL_ENDED",
                                    "reason": "inactivity",
                                    "message": "Call ended due to inactivity"
                                })
                            except:
                                pass
                            # Cancel the task to end the pipeline
                            await task.queue_frame(CancelTaskFrame())
                            ROOMS["agent_room"][user_id]["is_active"] = False
                            break
                        else:
                            # Send inactivity prompt
                            prompts_sent += 1
                            ROOMS["agent_room"][user_id]["inactivity_prompts"] = prompts_sent
                            ROOMS["agent_room"][user_id]["last_user_speech"] = current_time  # Reset timer
                            
                            prompt_messages = [
                                "Are you still there? I'm here whenever you're ready to continue.",
                                "Hello? I haven't heard from you in a while. Is everything okay?",
                                "I'm still here if you'd like to keep talking. Just say something when you're ready."
                            ]
                            prompt = prompt_messages[min(prompts_sent - 1, len(prompt_messages) - 1)]
                            
                            logger.info(f"Sending inactivity prompt {prompts_sent} to {user_id}")
                            inactivity_msg = [
                                {"role": "user", "content": f"[System: User has been silent for 2 minutes. Ask them: '{prompt}']"}
                            ]
                            await task.queue_frames([LLMMessagesAppendFrame(messages=inactivity_msg, run_llm=True)])
            
            # Register event handler for user speech to reset inactivity timer
            @transport.event_handler("on_user_started_speaking")
            async def on_user_started_speaking(transport):
                if user_id in ROOMS.get("agent_room", {}):
                    ROOMS["agent_room"][user_id]["last_user_speech"] = asyncio.get_event_loop().time()
                    ROOMS["agent_room"][user_id]["inactivity_prompts"] = 0  # Reset prompt count
                    logger.debug(f"User {user_id} started speaking, reset inactivity timer")
            
            # Wait for Gemini to connect, then send READY and greeting
            async def initialize_agent():
                nonlocal ready_sent, greeting_sent, inactivity_task
                
                # Poll for Gemini connection - check if the service has a connected session
                # The service sets _session when connected
                max_wait = 30  # Maximum 30 seconds to wait
                poll_interval = 0.5  # Check every 500ms
                waited = 0
                
                while waited < max_wait:
                    await asyncio.sleep(poll_interval)
                    waited += poll_interval
                    
                    # Check if Gemini service has an active session (indicates connection)
                    if hasattr(llm_service, '_session') and llm_service._session is not None:
                        logger.info(f"Gemini connected after {waited:.1f}s")
                        break
                else:
                    logger.warning(f"Gemini connection timeout after {max_wait}s, proceeding anyway")
                
                # Add a small extra delay to ensure everything is ready
                await asyncio.sleep(0.5)
                
                if not ready_sent:
                    ready_sent = True
                    logger.info(f"Agent ready for {user_id}, sending READY signal")
                    await websocket.send_json({"type": "READY", "partnerName": "Vox AI", "partnerLanguage": current_lang})
                
                if not greeting_sent:
                    greeting_sent = True
                    logger.info(f"Triggering greeting in {lang_name}")
                    greeting_msg = [
                        {"role": "user", "content": f"I have just connected. Introduce yourself as Voxa in {lang_name}, and ask for my name."}
                    ]
                    await task.queue_frames([LLMMessagesAppendFrame(messages=greeting_msg, run_llm=True)])
                    
                    # Reset the last speech time after greeting
                    ROOMS["agent_room"][user_id]["last_user_speech"] = asyncio.get_event_loop().time()
                    
                    # Start inactivity checker
                    inactivity_task = asyncio.create_task(check_inactivity())
            
            # Start initialization task
            init_task = asyncio.create_task(initialize_agent())
            
            try:
                await runner.run(task)
            finally:
                # Clean up tasks
                if inactivity_task and not inactivity_task.done():
                    inactivity_task.cancel()
                if not init_task.done():
                    init_task.cancel()
            
            logger.info(f"Agent pipeline loop for {user_id} (restart for lang/name change)")

    except WebSocketDisconnect:
        logger.info(f"Agent session ended for user {user_id}")
        if "agent_room" in ROOMS and user_id in ROOMS["agent_room"]:
            ROOMS["agent_room"][user_id]["is_active"] = False
            del ROOMS["agent_room"][user_id]
    except Exception as e:
        logger.error(f"Error in agent pipeline: {e}")
        if "agent_room" in ROOMS and user_id in ROOMS["agent_room"]:
            ROOMS["agent_room"][user_id]["is_active"] = False


@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    logger.info(f"User {user_id} joined room {room_id} over Pipecat WebSocket")

    user_name = "Guest"
    user_lang = "en-US"
    try:
        data = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        if data.get("type") == "JOIN":
            user_name = data.get("username", "Guest")
            user_lang = data.get("language", "en-US")
    except Exception as e:
        logger.warning(f"Could not receive JOIN message: {e}")

    if room_id not in ROOMS:
        ROOMS[room_id] = {}
        
    ROOMS[room_id][user_id] = {
        "websocket": websocket,
        "name": user_name,
        "language": user_lang
    }

    # When a second person joins, send READY signal to both
    if len(ROOMS[room_id]) == 2:
        for uid, user_dict in ROOMS[room_id].items():
            ws = user_dict["websocket"]
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

    # Wait for partner to join before starting the AI pipeline
    try:
        while True:
            partner_data = next((u for k, u in ROOMS[room_id].items() if k != user_id), None)
            if partner_data:
                break
            # Drain socket while waiting
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected while waiting for partner")
        if room_id in ROOMS and user_id in ROOMS[room_id]:
            del ROOMS[room_id][user_id]
        return

    try:
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_in_filter=RNNoiseFilter(),
                audio_out_enabled=False,
                add_wav_header=False,
                vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.45, stop_secs=0.8)),
                serializer=RawBinarySerializer(room_id, user_id)
            )
        )

        while True:
            # Re-read partner language dynamically
            partner_data = next((u for k, u in ROOMS[room_id].items() if k != user_id), None)
            target_language_code = partner_data["language"] if partner_data else "en-US"
            
            LANGUAGE_MAP = {
                "en-US": "American English",
                "en-GB": "British English",
                "en-NG": "Nigerian English",
                "fr-FR": "French",
                "es-ES": "Spanish",
                "pt-BR": "Portuguese",
                "de-DE": "German",
                "yo-NG": "Yoruba",
                "ig-NG": "Igbo",
                "ha-NG": "Hausa",
                "zh-CN": "Mandarin Chinese",
                "ar-SA": "Arabic"
            }
            target_language_name = LANGUAGE_MAP.get(target_language_code, target_language_code)
            
            logger.info(f"Initializing AI for user {user_id} with target language: {target_language_name}")

            llm_service = GeminiLiveLLMService(
                api_key=os.getenv("GOOGLE_API_KEY", ""),
                model="gemini-2.5-flash-native-audio-latest",
                voice_id="Puck",
                system_instruction=(
                    f"You are a pure real-time voice translator. You MUST NEVER act as a chatbot. "
                    f"You MUST NEVER answer questions or converse with the user. "
                    f"Your ONLY function is to listen to the user and immediately output the direct translation in {target_language_name}. "
                    f"If the user asks a question, translate the question. Do not answer it. "
                    f"Do not summarize, do not add introductory phrases like 'Okay', just speak the translation natively and quickly."
                ),
                params=InputParams(
                    thinking=ThinkingConfig(thinking_budget=0),
                    vad=GeminiVADParams(prefix_padding_ms=150, silence_duration_ms=700)
                )
            )

            router_processor = RouteToPartnerProcessor(room_id, user_id)
            pipeline = Pipeline([transport.input(), llm_service, router_processor, transport.output()])
            task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=False, enable_metrics=False))
            
            ROOMS[room_id][user_id]["task"] = task
            runner = PipelineRunner()
            await runner.run(task)
            logger.info(f"Pipeline finished for user {user_id}, looping to apply new language...")

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from room {room_id}")
        if room_id in ROOMS and user_id in ROOMS[room_id]:
            del ROOMS[room_id][user_id]
            for uid, user_data in ROOMS[room_id].items():
                try:
                    await user_data["websocket"].send_json({"type": "PARTNER_LEFT"})
                except: pass
    except Exception as e:
        logger.error(f"Error in pipecat pipeline for user {user_id}: {e}")
