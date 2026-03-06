from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel
import uuid
import os
from cartesia import Cartesia
import tempfile

router = APIRouter()

class RoomResponse(BaseModel):
    room_id: str

@router.post("/api/rooms", response_model=RoomResponse)
async def create_room():
    # Generate a random room ID
    room_id = str(uuid.uuid4())[:8]
    return {"room_id": room_id}

@router.get("/api/rooms/{room_id}/verify")
async def verify_room(room_id: str):
    # For now, simply verify any room ID format is somewhat valid
    if len(room_id) > 0:
        return {"status": "valid"}
    return {"status": "invalid"}

@router.post("/api/voice-profile")
async def upload_voice_profile(file: UploadFile = File(...)):
    try:
        # Save uploaded audio temporarily
        audio_content = await file.read()
        fd, temp_filename = tempfile.mkstemp(suffix=".webm")
        with os.fdopen(fd, "wb") as f:
            f.write(audio_content)

        # Use Cartesia to clone voice
        client = Cartesia(api_key=os.getenv("CARTESIA_API_KEY", "sk_car_C6yXsTuvARZqLQyeHuRK8z"))
        
        with open(temp_filename, "rb") as f:
            voice_name = f"Vox_User_{uuid.uuid4().hex[:4]}"
            cloned_voice = client.voices.clone(
                filepath=f,
                name=voice_name,
                description="Cloned user voice for Vox live call"
            )
        
        os.remove(temp_filename)
        
        return {
            "profile_id": cloned_voice["id"], 
            "analysis": {"status": "cloned", "voice_id": cloned_voice["id"], "name": voice_name}
        }
    except Exception as e:
        print(f"Error cloning voice: {e}")
        # Fallback to default cartesia voice if it fails
        return {
            "profile_id": "e07c00bc-4134-4eae-9ea4-1a55fb45746b", 
            "analysis": {"status": "fallback", "error": str(e)}
        }

