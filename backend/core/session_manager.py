"""
Session Manager Module
Manages room sessions and user state using Redis
"""
import json
import time
from typing import Optional, Dict
import redis.asyncio as redis
from config import config

class SessionManager:
    def __init__(self):
        self.redis_url = config.REDIS_URL
        self.redis_client = None
        
    async def connect(self):
        """Initialize Redis connection"""
        if not self.redis_client:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
    
    async def disconnect(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.close()
            self.redis_client = None
    
    async def create_room(self, room_id: str) -> bool:
        """Create a new room session"""
        await self.connect()
        
        room_data = {
            "status": "waiting",
            "created_at": time.time(),
            "users": {}
        }
        
        try:
            await self.redis_client.set(
                f"room:{room_id}",
                json.dumps(room_data),
                ex=3600  # 1 hour expiry
            )
            return True
        except Exception as e:
            print(f"Error creating room: {e}")
            return False
    
    async def join_room(
        self, 
        room_id: str, 
        user_id: str, 
        username: str,
        voice_profile_id: str = None,
        language: str = "en-US"
    ) -> bool:
        """Add a user to a room"""
        await self.connect()
        
        try:
            room_data = await self.get_room(room_id)
            if not room_data:
                return False
            
            # Determine user slot (user_a or user_b)
            if "user_a" not in room_data.get("users", {}):
                slot = "user_a"
            elif "user_b" not in room_data.get("users", {}):
                slot = "user_b"
            else:
                return False  # Room is full
            
            room_data["users"][slot] = {
                "user_id": user_id,
                "username": username,
                "language": language,
                "voice_profile_id": voice_profile_id,
                "connected_at": time.time()
            }
            
            # Update status if both users present
            if len(room_data["users"]) == 2:
                room_data["status"] = "active"
            
            await self.redis_client.set(
                f"room:{room_id}",
                json.dumps(room_data),
                ex=3600
            )
            return True
            
        except Exception as e:
            print(f"Error joining room: {e}")
            return False
    
    async def get_room(self, room_id: str) -> Optional[Dict]:
        """Get room data"""
        await self.connect()
        
        try:
            data = await self.redis_client.get(f"room:{room_id}")
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            print(f"Error getting room: {e}")
            return None
    
    async def get_partner(self, room_id: str, user_id: str) -> Optional[Dict]:
        """Get partner's details in a room"""
        room_data = await self.get_room(room_id)
        if not room_data:
            return None
        
        users = room_data.get("users", {})
        for slot, user_data in users.items():
            if user_data.get("user_id") != user_id:
                return user_data
        
        return None
    
    async def update_language(self, room_id: str, user_id: str, language_code: str) -> bool:
        """Update detected language for a user"""
        await self.connect()
        
        try:
            room_data = await self.get_room(room_id)
            if not room_data:
                return False
            
            for slot, user_data in room_data.get("users", {}).items():
                if user_data.get("user_id") == user_id:
                    room_data["users"][slot]["language"] = language_code
                    break
            
            await self.redis_client.set(
                f"room:{room_id}",
                json.dumps(room_data),
                ex=3600
            )
            return True
            
        except Exception as e:
            print(f"Error updating language: {e}")
            return False
    
    async def leave_room(self, room_id: str, user_id: str) -> bool:
        """Remove a user from a room"""
        await self.connect()
        
        try:
            room_data = await self.get_room(room_id)
            if not room_data:
                return False
            
            for slot, user_data in list(room_data.get("users", {}).items()):
                if user_data.get("user_id") == user_id:
                    del room_data["users"][slot]
                    break
            
            # Update status
            if len(room_data["users"]) == 0:
                room_data["status"] = "ended"
            else:
                room_data["status"] = "waiting"
            
            await self.redis_client.set(
                f"room:{room_id}",
                json.dumps(room_data),
                ex=3600
            )
            return True
            
        except Exception as e:
            print(f"Error leaving room: {e}")
            return False
    
    async def end_room(self, room_id: str) -> bool:
        """End and clean up a room session"""
        await self.connect()
        
        try:
            await self.redis_client.delete(f"room:{room_id}")
            return True
        except Exception as e:
            print(f"Error ending room: {e}")
            return False
