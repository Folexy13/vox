import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.network.websocket_server import WebsocketServerTransport, WebsocketServerParams
from pipecat.services.google import GoogleTTSService
import os

router = APIRouter()

@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    logger.info(f"User {user_id} joined room {room_id} over Pipecat WebSocket")

    try:
        # 1. Transport setup (WebSocket for audio in/out)
        transport = WebsocketServerTransport(
            params=WebsocketServerParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                add_wav_header=False,
                vad_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),
                vad_audio_passthrough=True
            )
        )

        # 2. Native Gemini Live setup (Handles intent, transcription, translation natively)
        llm_service = GeminiLiveLLMService(
            api_key=os.getenv("GOOGLE_API_KEY", ""),
            model="gemini-2.0-flash-exp",
            system_instruction=(
                "You are Vox, an invisible real-time translation agent. "
                "You listen to the user and translate their speech to the other user's language smoothly. "
                "Retain their emotional register and keep it conversational."
            )
        )

        # 3. Google TTS setup (For voice cloning and playback)
        tts_service = GoogleTTSService(
            credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
            voice_name="en-US-Journey-F", # Default, can be dynamically swapped per session
        )

        # 4. Construct Pipecat Pipeline
        # Audio from Transport -> VAD -> Gemini Live -> TTS -> Transport Output
        pipeline = Pipeline([
            transport.input(),    # Receive user audio
            llm_service,          # Process meaning and translate
            tts_service,          # Convert text translation back to speech
            transport.output()    # Send back to the caller
        ])

        task = PipelineTask(
            pipeline,
            PipelineParams(
                allow_interruptions=True,
                enable_metrics=True,
                send_initial_empty_metrics=False
            )
        )

        runner = PipelineRunner()

        # In a real Pipecat deployment, the transport needs the connection to run.
        # Since FastAPI manages the websocket, we map FastAPI's websocket to the Pipecat transport here.
        transport._websocket = websocket 

        await runner.run(task)

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from room {room_id}")
    except Exception as e:
        logger.error(f"Error in pipecat pipeline for user {user_id}: {e}")
