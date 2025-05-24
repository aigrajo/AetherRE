#!/usr/bin/env python3
import sys
import json
from typing import Dict, List, Optional, Any
from datetime import datetime

from backend.services.notes_service import get_note
from backend.services.tag_service import TagService


class FunctionContextService:
    """Service to manage and cache function context data on the backend."""
    
    def __init__(self):
        self.current_function_data: Dict[str, Dict[str, Any]] = {}
        self.session_context_states: Dict[str, str] = {}  # session_id -> function_id
        self.tag_service = TagService()  # Initialize TagService instance
    
    def set_current_function(self, function_id: str, data: Dict[str, Any]):
        """Cache all function data when a function is loaded.
        
        Args:
            function_id: Unique identifier for the function
            data: Complete function data including assembly, variables, etc.
        """
        print(f"[FunctionContext] Caching data for function {function_id}", file=sys.stderr)
        
        self.current_function_data[function_id] = {
            'assembly': data.get('assembly', []),
            'variables': data.get('variables', []),
            'xrefs': data.get('xrefs', {}),
            'strings': data.get('strings', []),
            'cfg': data.get('cfg', {}),
            'function_name': data.get('function_name', 'Unknown Function'),
            'address': data.get('address', '0x0'),
            'pseudocode': data.get('pseudocode', ''),
            'binary_name': data.get('binary_name', ''),
            'cached_at': datetime.now().isoformat()
        }
    
    def set_session_function(self, session_id: str, function_id: str):
        """Associate a session with a function for context retrieval."""
        self.session_context_states[session_id] = function_id
        print(f"[FunctionContext] Session {session_id} now associated with function {function_id}", file=sys.stderr)
    
    def get_context_for_session(self, session_id: str, toggle_states: Dict[str, bool], 
                               dynamic_content: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Build context based on session's function and what the user wants to include.
        
        Args:
            session_id: Session identifier
            toggle_states: Dictionary of toggle states (e.g., {'assembly': True, 'variables': False})
            dynamic_content: Dynamic content like current pseudocode
            
        Returns:
            Dictionary containing the requested context data
        """
        function_id = self.session_context_states.get(session_id)
        if not function_id or function_id not in self.current_function_data:
            print(f"[FunctionContext] No function data for session {session_id}", file=sys.stderr)
            return {}
        
        data = self.current_function_data[function_id]
        
        # Build base context
        context = {
            'functionName': data['function_name'],
            'address': data['address'],
            'binaryName': data['binary_name']
        }
        
        # Add requested data based on toggle states
        if toggle_states.get('assembly', False):
            context['assembly'] = data['assembly']
            print(f"[FunctionContext] Including assembly data ({len(data['assembly'])} instructions)", file=sys.stderr)
        
        if toggle_states.get('variables', False):
            context['variables'] = data['variables']
            print(f"[FunctionContext] Including variables data ({len(data['variables'])} variables)", file=sys.stderr)
        
        if toggle_states.get('xrefs', False):
            context['xrefs'] = data['xrefs']
            incoming_count = len(data['xrefs'].get('incoming', []))
            outgoing_count = len(data['xrefs'].get('outgoing', []))
            print(f"[FunctionContext] Including xrefs data ({incoming_count} incoming, {outgoing_count} outgoing)", file=sys.stderr)
        
        if toggle_states.get('strings', False):
            context['strings'] = data['strings']
            print(f"[FunctionContext] Including strings data ({len(data['strings'])} strings)", file=sys.stderr)
        
        if toggle_states.get('cfg', False):
            context['cfg'] = data['cfg']
            node_count = len(data['cfg'].get('nodes', []))
            edge_count = len(data['cfg'].get('edges', []))
            print(f"[FunctionContext] Including CFG data ({node_count} nodes, {edge_count} edges)", file=sys.stderr)
        
        # Handle pseudocode - use dynamic content if available, otherwise cached
        if toggle_states.get('pseudocode', False):
            if dynamic_content and 'pseudocode' in dynamic_content:
                context['pseudocode'] = dynamic_content['pseudocode']
                print("[FunctionContext] Including dynamic pseudocode content", file=sys.stderr)
            else:
                context['pseudocode'] = data['pseudocode']
                print("[FunctionContext] Including cached pseudocode content", file=sys.stderr)
        
        # Fetch notes and tags if requested
        binary_name = data['binary_name']
        if binary_name and function_id:
            if toggle_states.get('notes', False):
                try:
                    note_content = get_note(binary_name, function_id)
                    if note_content:
                        context['notes'] = note_content
                        print(f"[FunctionContext] Including notes data", file=sys.stderr)
                except Exception as e:
                    print(f"[FunctionContext] Error fetching notes: {e}", file=sys.stderr)
            
            if toggle_states.get('tags', False):
                try:
                    ai_context_tags = self.tag_service.get_ai_context_tags(binary_name, function_id)
                    if ai_context_tags:
                        context['tags'] = ai_context_tags
                        print(f"[FunctionContext] Including {len(ai_context_tags)} AI context tags", file=sys.stderr)
                except Exception as e:
                    print(f"[FunctionContext] Error fetching tags: {e}", file=sys.stderr)
        
        return context
    
    def get_available_functions(self) -> List[str]:
        """Get list of available function IDs."""
        return list(self.current_function_data.keys())
    
    def clear_function_data(self, function_id: str):
        """Clear cached data for a specific function."""
        if function_id in self.current_function_data:
            del self.current_function_data[function_id]
            print(f"[FunctionContext] Cleared data for function {function_id}", file=sys.stderr)
    
    def clear_all_data(self):
        """Clear all cached function data."""
        self.current_function_data.clear()
        self.session_context_states.clear()
        print("[FunctionContext] Cleared all cached data", file=sys.stderr)


# Global instance
function_context_service = FunctionContextService() 