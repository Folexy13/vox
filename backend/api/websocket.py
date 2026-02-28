"""
WebSocket API Module
Handles real-time audio streaming and room management
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from typing import Dict, Optional
import asyncio
import uuid
import json
import struct
from google.cloud import storage
from core.audio_pipeline import AudioPipeline
from config import config

router = APIRouter()

# Global state for active meetings
# room_id -> { "created_at": timestamp, "users": { user_id: {username, language, profile_id} } }
active_meetings: Dict[str, dict] = {}

# Connection tracking: room_id -> {user_id -> WebSocket}
rooms: Dict[str, Dict[str, WebSocket]] = {}
# room_id -> AudioPipeline
pipelines: Dict[str, AudioPipeline] = {}

try:
    storage_client = storage.Client()
except Exception as e:
    print(f"Warning: Could not initialize GCS client: {e}")
    storage_client = None

@router.post("/api/rooms")
async def create_room():
    """
    Creates a new validated meeting session.
    """
    room_id = str(uuid.uuid4())[:8]
    active_meetings[room_id] = {"users": {}}
    print(f"SESSION CREATED: {room_id}")
    return {"room_id": room_id}

@router.get("/api/rooms/{room_id}/verify")
async def verify_room(room_id: str):
    """
    Checks if a meeting session exists.
    Returns 404 if room doesn't exist - users must use a valid meeting link.
    """
    if room_id not in active_meetings:
        raise HTTPException(status_code=404, detail="Meeting session not found or expired")
    return {"status": "valid", "user_count": len(active_meetings[room_id].get("users", {}))}

@router.post("/api/voice-profile")
async def create_voice_profile(file: UploadFile = File(...)):
    """
    Upload and store voice profile for voice matching
    """
    content = await file.read()
    profile_id = f"profile-{uuid.uuid4()}"
    
    if storage_client:
        try:
            bucket = storage_client.bucket(config.GCS_BUCKET_NAME)
            blob = bucket.blob(f"profiles/{profile_id}.wav")
            blob.upload_from_string(content, content_type='audio/wav')
            print(f"Voice profile uploaded: {profile_id}")
            return {"profile_id": profile_id}
        except Exception as e:
            print(f"GCS upload error: {e}")
    
    # Fallback for local development
    print(f"Voice profile stored locally: {profile_id}")
    return {"profile_id": f"local-{profile_id}"}

@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    """
    WebSocket endpoint for real-time audio streaming
    
    Protocol:
    1. Client sends JOIN message with username and language
    2. Server sends READY when partner joins
    3. Client sends audio chunks as binary with VAD metadata
    4. Server processes and sends back translated audio
    """
    # Validate room exists before accepting connection
    if room_id not in active_meetings:
        await websocket.close(code=4004, reason="Meeting session not found")
        return

    await websocket.accept()
    
    # Expect first message to be a JOIN message with username
    try:
        init_data = await websocket.receive_json()
        if init_data.get("type") != "JOIN" or not init_data.get("username"):
            print(f"VERIFICATION FAILURE: Room {room_id}, User {user_id}")
            await websocket.close(code=4003)
            return
        
        username = init_data["username"]
        user_language = init_data.get("language", "en-US")
        profile_id = init_data.get("profileId")
        
        print(f"USER JOINED: Room {room_id}, User {username} ({user_id}), Language: {user_language}")
        
        # Initialize room structures if needed
        if room_id not in rooms:
            rooms[room_id] = {}
            pipelines[room_id] = AudioPipeline(room_id)
            
        rooms[room_id][user_id] = websocket
        active_meetings[room_id]["users"][user_id] = {
            "username": username,
            "language": user_language,
            "profile_id": profile_id
        }
        
        # Set user's language and profile in pipeline
        pipeline = pipelines[room_id]
        pipeline.set_user_language(user_id, user_language)
        if profile_id:
            pipeline.set_user_profile(user_id, profile_id)
        
        # Notify if partner is already here
        partner_id = next((uid for uid in rooms[room_id] if uid != user_id), None)
        if partner_id:
            partner_data = active_meetings[room_id]["users"].get(partner_id, {})
            partner_name = partner_data.get("username", "Guest")
            partner_language = partner_data.get("language", "en-US")
            
            # Tell NEW user about OLD user
            await websocket.send_json({
                "type": "READY", 
                "partnerName": partner_name,
                "partnerLanguage": partner_language,
                "message": f"Connected with {partner_name}"
            })
            
            # Tell OLD user about NEW user
            await rooms[room_id][partner_id].send_json({
                "type": "READY", 
                "partnerName": username,
                "partnerLanguage": user_language,
                "message": f"{username} joined the meeting"
            })

        # Main message loop
        while True:
            message = await websocket.receive()
            
            if "bytes" in message:
                # Binary audio data
                audio_data = message["bytes"]
                print(f"BINARY AUDIO from {user_id}: {len(audio_data)} bytes")
                await handle_audio_message(
                    room_id, user_id, audio_data, 
                    vad_speaking=True  # Default to speaking if no metadata
                )
            
            elif "text" in message:
                # JSON control message
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")
                    
                    if msg_type == "AUDIO_WITH_VAD":
                        # Audio data with VAD metadata
                        # Audio is base64 encoded in the message
                        import base64
                        audio_bytes = base64.b64decode(data.get("audio", ""))
                        vad_speaking = data.get("speaking", True)
                        
                        await handle_audio_message(
                            room_id, user_id, audio_bytes, vad_speaking
                        )
                    
                    elif msg_type == "LANGUAGE_UPDATE":
                        # User changed their language preference
                        new_language = data.get("language")
                        if new_language:
                            active_meetings[room_id]["users"][user_id]["language"] = new_language
                            pipeline.set_user_language(user_id, new_language)
                            
                            # Notify partner
                            partner_id = next((uid for uid in rooms[room_id] if uid != user_id), None)
                            if partner_id:
                                await rooms[room_id][partner_id].send_json({
                                    "type": "LANGUAGE_UPDATE",
                                    "language": new_language,
                                    "user": "partner"
                                })
                    
                    elif msg_type == "MUTE":
                        # User muted/unmuted
                        is_muted = data.get("muted", False)
                        print(f"User {user_id} {'muted' if is_muted else 'unmuted'}")
                    
                    elif msg_type == "PING":
                        # Heartbeat ping - respond with pong
                        await websocket.send_json({"type": "PONG"})
                        
                        # Update last heartbeat time for this user
                        if room_id in active_meetings and user_id in active_meetings[room_id].get("users", {}):
                            active_meetings[room_id]["users"][user_id]["last_heartbeat"] = asyncio.get_event_loop().time()
                            
                            # Notify partner that this user is online
                            partner_id = next((uid for uid in rooms.get(room_id, {}) if uid != user_id), None)
                            if partner_id and partner_id in rooms.get(room_id, {}):
                                try:
                                    await rooms[room_id][partner_id].send_json({
                                        "type": "PARTNER_HEARTBEAT",
                                        "online": True
                                    })
                                except:
                                    pass
                    
                    elif msg_type == "LEAVE":
                        # User is leaving the call
                        print(f"User {user_id} leaving room {room_id}")
                        await cleanup_user(room_id, user_id)
                        await websocket.close(code=1000, reason="User left")
                        return
                        
                except json.JSONDecodeError:
                    print(f"Invalid JSON message from {user_id}")

    except WebSocketDisconnect:
        print(f"USER DISCONNECTED: {user_id}")
        await cleanup_user(room_id, user_id)
        
    except Exception as e:
        print(f"WEBSOCKET ERROR: {e}")
        await cleanup_user(room_id, user_id)


async def handle_audio_message(
    room_id: str, 
    user_id: str, 
    audio_data: bytes, 
    vad_speaking: bool
):
    """
    Process incoming audio and send to partner
    """
    if room_id not in rooms or room_id not in pipelines:
        print(f"NO ROOM/PIPELINE for {room_id}")
        return
    
    partner_id = next((uid for uid in rooms[room_id] if uid != user_id), None)
    if not partner_id:
        print(f"NO PARTNER for {user_id} in room {room_id}")
        return
    
    pipeline = pipelines[room_id]
    
    # Process audio through pipeline
    print(f"PROCESSING AUDIO: {len(audio_data)} bytes from {user_id} to {partner_id}")
    processed_audio, status_update = await pipeline.process_audio_chunk(
        user_id, partner_id, audio_data, vad_speaking
    )
    print(f"PIPELINE RESULT: audio={len(processed_audio) if processed_audio else 0} bytes, status={status_update}")
    
    partner_ws = rooms[room_id].get(partner_id)
    if not partner_ws:
        return
    
    # Send status update to both users
    if status_update:
        try:
            # Send to speaker (user)
            user_ws = rooms[room_id].get(user_id)
            if user_ws:
                await user_ws.send_json(status_update)
            
            # Send relevant status to partner
            if status_update.get("type") == "STATUS":
                # Get user's language from meeting data
                user_language = None
                if room_id in active_meetings and user_id in active_meetings[room_id].get("users", {}):
                    user_language = active_meetings[room_id]["users"][user_id].get("language")
                
                partner_status = {
                    "type": "PARTNER_STATUS",
                    "status": status_update.get("status"),
                    "partnerLanguage": status_update.get("from_language") or user_language
                }
                await partner_ws.send_json(partner_status)
                
        except Exception as e:
            import traceback
            print(f"Error sending status: {e}")
            traceback.print_exc()
    
    # Send processed audio to partner
    if processed_audio:
        try:
            print(f"SENDING AUDIO to partner: {len(processed_audio)} bytes")
            await partner_ws.send_bytes(processed_audio)
            print(f"AUDIO SENT successfully")
        except Exception as e:
            import traceback
            print(f"Error sending audio: {e}")
            traceback.print_exc()


async def cleanup_user(room_id: str, user_id: str):
    """
    Clean up when a user disconnects.
    Room is kept alive for 5 minutes to allow rejoining.
    """
    if room_id in rooms and user_id in rooms[room_id]:
        del rooms[room_id][user_id]
        
        if user_id in active_meetings.get(room_id, {}).get("users", {}):
            del active_meetings[room_id]["users"][user_id]
            
        if not rooms[room_id]:
            # Room is empty, clean up connection tracking but keep meeting alive
            del rooms[room_id]
            if room_id in pipelines:
                del pipelines[room_id]
            # Schedule room deletion after 5 minutes grace period
            asyncio.create_task(schedule_room_cleanup(room_id, delay_seconds=300))
        else:
            # Notify remaining partner
            partner_id = next(iter(rooms[room_id]))
            try:
                # Send partner offline notification
                await rooms[room_id][partner_id].send_json({
                    "type": "PARTNER_HEARTBEAT",
                    "online": False
                })
                # Also send partner left message
                await rooms[room_id][partner_id].send_json({
                    "type": "PARTNER_LEFT", 
                    "message": "Partner disconnected."
                })
            except:
                pass


async def schedule_room_cleanup(room_id: str, delay_seconds: int = 300):
    """
    Delete room after a grace period if no one rejoins.
    """
    await asyncio.sleep(delay_seconds)
    # Only delete if room is still empty (no one rejoined)
    if room_id in active_meetings and room_id not in rooms:
        del active_meetings[room_id]
        print(f"ROOM EXPIRED: {room_id} (no activity for {delay_seconds}s)")
