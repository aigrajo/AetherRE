#!/usr/bin/env python3
import sys
from typing import Dict, Optional
from datetime import datetime

from backend.services.function_context import function_context_service


class SessionManager:
    """Centralized session state management."""
    
    def __init__(self):
        self.current_session_by_user: Dict[str, str] = {}  # user_id -> session_id
        self.session_function_mappings: Dict[str, str] = {}  # session_id -> function_id
    
    def set_current_session(self, session_id: str, user_id: str = "default"):
        """Set the current active session for a user."""
        self.current_session_by_user[user_id] = session_id
        print(f"[SessionManager] Set current session for {user_id}: {session_id}", file=sys.stderr)
    
    def get_current_session(self, user_id: str = "default") -> Optional[str]:
        """Get the current active session for a user."""
        return self.current_session_by_user.get(user_id)
    
    def associate_session_with_function(self, session_id: str, function_id: str):
        """Associate a session with a function for context retrieval."""
        self.session_function_mappings[session_id] = function_id
        function_context_service.set_session_function(session_id, function_id)
        print(f"[SessionManager] Associated session {session_id} with function {function_id}", file=sys.stderr)
    
    def get_session_function(self, session_id: str) -> Optional[str]:
        """Get the function associated with a session."""
        return self.session_function_mappings.get(session_id)
    
    def clear_session_associations(self, session_id: str):
        """Clear all associations for a session."""
        if session_id in self.session_function_mappings:
            del self.session_function_mappings[session_id]
        
        # Also remove from current sessions
        for user_id, current_session in list(self.current_session_by_user.items()):
            if current_session == session_id:
                del self.current_session_by_user[user_id]
        
        print(f"[SessionManager] Cleared associations for session {session_id}", file=sys.stderr)
    
    def get_or_create_session_for_function(self, function_id: str, user_id: str = "default") -> str:
        """Get existing session for function or create a new one."""
        # Look for existing session with this function
        for session_id, mapped_function_id in self.session_function_mappings.items():
            if mapped_function_id == function_id:
                self.set_current_session(session_id, user_id)
                return session_id
        
        # Create new session and associate with function
        from backend.services.chat import create_new_session
        session_id = create_new_session()
        self.associate_session_with_function(session_id, function_id)
        self.set_current_session(session_id, user_id)
        
        print(f"[SessionManager] Created new session {session_id} for function {function_id}", file=sys.stderr)
        return session_id


# Global instance
session_manager = SessionManager() 