"""
Interruption Handler Module
Manages VAD-based interruption handling for natural conversation flow
This is the core feature that satisfies the hackathon's interruptible agent requirement
"""
import asyncio
import time
from enum import Enum
from typing import Dict, Optional

class CallState(Enum):
    SILENCE = "SILENCE"
    ONLY_A_SPEAKING = "ONLY_A_SPEAKING"
    ONLY_B_SPEAKING = "ONLY_B_SPEAKING"
    BOTH_SPEAKING = "BOTH_SPEAKING"

class InterruptionHandler:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.active_tasks: Dict[str, asyncio.Task] = {}  # user_id -> current processing task
        self.last_activity: Dict[str, float] = {}  # user_id -> timestamp
        self.speaking_state: Dict[str, bool] = {}  # user_id -> is_speaking
        self.current_state = CallState.SILENCE
        
        # Timing thresholds (in seconds)
        self.speech_timeout = 0.3  # Time after which we consider speech ended
        self.interruption_threshold = 0.1  # Minimum time to trigger interruption
        
    def get_state(self) -> CallState:
        """Get current call state"""
        return self.current_state
        
    async def handle_audio_arrival(
        self, 
        user_id: str, 
        partner_id: str, 
        is_speaking: bool = True
    ):
        """
        Logic for satisfying the 'Natural Conversation & Interruption' requirement.
        
        When new audio arrives from user_id while partner_id is being processed,
        cancel the partner's task immediately.
        
        States:
        - ONLY_A_SPEAKING: process A, deliver to B
        - ONLY_B_SPEAKING: process B, deliver to A
        - BOTH_SPEAKING: separate streams, process both independently
        - SILENCE: hold, wait
        """
        now = time.time()
        self.last_activity[user_id] = now
        self.speaking_state[user_id] = is_speaking
        
        # Update call state based on who is speaking
        self._update_call_state(user_id, partner_id)
        
        # If this user started speaking while partner is being processed
        if is_speaking and partner_id in self.active_tasks:
            partner_task = self.active_tasks[partner_id]
            
            # Check if partner's task is still running
            if not partner_task.done():
                # Check if this is a real interruption (not just overlap)
                partner_last_activity = self.last_activity.get(partner_id, 0)
                time_since_partner = now - partner_last_activity
                
                if time_since_partner > self.interruption_threshold:
                    # This is an interruption - cancel partner's processing
                    print(f"INTERRUPTING: User {user_id} started speaking while {partner_id} was being processed.")
                    partner_task.cancel()
                    
                    try:
                        await partner_task
                    except asyncio.CancelledError:
                        pass
                    
                    if partner_id in self.active_tasks:
                        del self.active_tasks[partner_id]
                else:
                    # Both speaking simultaneously - crosstalk mode
                    print(f"CROSSTALK: Both {user_id} and {partner_id} speaking simultaneously")
                    # Don't cancel - process both streams independently
    
    def _update_call_state(self, user_id: str, partner_id: str):
        """Update the current call state based on speaking states"""
        user_speaking = self.speaking_state.get(user_id, False)
        partner_speaking = self.speaking_state.get(partner_id, False)
        
        # Check for speech timeout
        now = time.time()
        user_last = self.last_activity.get(user_id, 0)
        partner_last = self.last_activity.get(partner_id, 0)
        
        # If no recent activity, consider not speaking
        if now - user_last > self.speech_timeout:
            user_speaking = False
        if now - partner_last > self.speech_timeout:
            partner_speaking = False
        
        # Determine state
        if user_speaking and partner_speaking:
            self.current_state = CallState.BOTH_SPEAKING
        elif user_speaking:
            self.current_state = CallState.ONLY_A_SPEAKING
        elif partner_speaking:
            self.current_state = CallState.ONLY_B_SPEAKING
        else:
            self.current_state = CallState.SILENCE

    def register_task(self, user_id: str, task: asyncio.Task):
        """Register a processing task for a user"""
        self.active_tasks[user_id] = task

    def clear_task(self, user_id: str):
        """Clear a completed task"""
        if user_id in self.active_tasks:
            del self.active_tasks[user_id]
    
    def is_user_speaking(self, user_id: str) -> bool:
        """Check if a user is currently speaking"""
        now = time.time()
        last_activity = self.last_activity.get(user_id, 0)
        
        if now - last_activity > self.speech_timeout:
            return False
        
        return self.speaking_state.get(user_id, False)
    
    def get_active_speakers(self) -> list:
        """Get list of currently active speakers"""
        now = time.time()
        active = []
        
        for user_id, last_time in self.last_activity.items():
            if now - last_time <= self.speech_timeout:
                if self.speaking_state.get(user_id, False):
                    active.append(user_id)
        
        return active
