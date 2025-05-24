#!/usr/bin/env python3
"""
History management service.
Centralizes all undo/redo operations across different operation types.
"""

import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class HistoryService:
    """Centralized service for all history management operations"""
    
    # In-memory history storage (could be replaced with persistent storage)
    _session_histories = {}
    
    # Maximum number of operations to keep in history per session
    MAX_HISTORY_SIZE = 100
    
    # Time window for coalescing operations (in seconds)
    COALESCE_WINDOW_SECONDS = 2.0
    
    @staticmethod
    def record_operation(
        session_id: str,
        operation_type: str,
        operation_data: Dict[str, Any],
        old_state: Dict[str, Any],
        new_state: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Record an operation for potential undo/redo.
        
        Args:
            session_id: Session identifier
            operation_type: Type of operation (e.g., 'rename_function', 'edit_note')
            operation_data: Operation-specific data
            old_state: State before operation
            new_state: State after operation
            metadata: Additional metadata for the operation
            
        Returns:
            Operation ID
        """
        # Check for no-op operations (old_state == new_state)
        if HistoryService._states_equal(old_state, new_state):
            logger.info(f"Skipping no-op operation {operation_type} for session {session_id}")
            return "no-op"
        
        # Check for duplicate operations (same as most recent operation)
        if session_id in HistoryService._session_histories:
            session_history = HistoryService._session_histories[session_id]
            if session_history['undo_stack']:
                last_operation = session_history['undo_stack'][-1]
                if HistoryService._operations_equivalent(
                    last_operation, operation_type, operation_data, old_state, new_state
                ):
                    logger.info(f"Skipping duplicate operation {operation_type} for session {session_id}")
                    return last_operation['id']
                
                # Check for coalescable operations (rapid edits of same type)
                if HistoryService._can_coalesce_operations(
                    last_operation, operation_type, operation_data, old_state, new_state
                ):
                    # Update the last operation with the new end state
                    last_operation['new_state'] = new_state
                    last_operation['timestamp'] = datetime.now().isoformat()
                    logger.info(f"Coalesced operation {operation_type} with ID {last_operation['id']} for session {session_id}")
                    return last_operation['id']
        
        operation_id = str(uuid.uuid4())
        
        if session_id not in HistoryService._session_histories:
            HistoryService._session_histories[session_id] = {
                'undo_stack': [],
                'redo_stack': []
            }
        
        session_history = HistoryService._session_histories[session_id]
        
        # Clear redo stack when a new operation is performed
        session_history['redo_stack'] = []
        
        operation = {
            'id': operation_id,
            'type': operation_type,
            'data': operation_data,
            'old_state': old_state,
            'new_state': new_state,
            'metadata': metadata or {},
            'timestamp': datetime.now().isoformat()
        }
        
        # Add to undo stack
        session_history['undo_stack'].append(operation)
        
        # Trim history if it exceeds the maximum size
        if len(session_history['undo_stack']) > HistoryService.MAX_HISTORY_SIZE:
            session_history['undo_stack'].pop(0)
        
        logger.info(f"Recorded operation {operation_type} with ID {operation_id} for session {session_id}")
        
        return operation_id
    
    @staticmethod
    def _states_equal(state1: Dict[str, Any], state2: Dict[str, Any]) -> bool:
        """
        Compare two states for equality, handling nested dictionaries and special cases.
        """
        try:
            # For note editing, compare the content field specifically
            if 'content' in state1 and 'content' in state2:
                return state1.get('content') == state2.get('content')
            
            # For other operations, do a deep comparison
            return state1 == state2
        except Exception:
            # If comparison fails, assume they're different
            return False
    
    @staticmethod
    def _operations_equivalent(
        last_operation: Dict[str, Any],
        operation_type: str,
        operation_data: Dict[str, Any],
        old_state: Dict[str, Any],
        new_state: Dict[str, Any]
    ) -> bool:
        """
        Check if a new operation is equivalent to the last recorded operation.
        """
        try:
            # Must be same operation type
            if last_operation['type'] != operation_type:
                return False
            
            # For note operations, check if we're essentially doing the same edit
            if operation_type == 'edit_note':
                last_old_content = last_operation['old_state'].get('content', '')
                last_new_content = last_operation['new_state'].get('content', '')
                current_old_content = old_state.get('content', '')
                current_new_content = new_state.get('content', '')
                
                # Check if this is the same edit (same content change)
                return (last_old_content == current_old_content and 
                        last_new_content == current_new_content)
            
            # For function/variable operations, check if same target and same change
            if operation_type in ['rename_function', 'rename_variable']:
                return (last_operation['data'] == operation_data and
                        HistoryService._states_equal(last_operation['old_state'], old_state) and
                        HistoryService._states_equal(last_operation['new_state'], new_state))
            
            # For other operations, do exact comparison
            return (last_operation['data'] == operation_data and
                    last_operation['old_state'] == old_state and
                    last_operation['new_state'] == new_state)
                    
        except Exception:
            # If comparison fails, assume they're different
            return False
    
    @staticmethod
    def _can_coalesce_operations(
        last_operation: Dict[str, Any],
        operation_type: str,
        operation_data: Dict[str, Any],
        old_state: Dict[str, Any],
        new_state: Dict[str, Any]
    ) -> bool:
        """
        Check if a new operation can be coalesced (merged) with the last operation.
        This is used for rapid edits like typing.
        """
        try:
            # Must be same operation type
            if last_operation['type'] != operation_type:
                return False
            
            # Check if the last operation is recent enough to coalesce
            last_timestamp = datetime.fromisoformat(last_operation['timestamp'])
            now = datetime.now()
            time_diff = (now - last_timestamp).total_seconds()
            
            if time_diff > HistoryService.COALESCE_WINDOW_SECONDS:
                return False
            
            # For note operations, check if this is a continuation of the same edit
            if operation_type == 'edit_note':
                # The new operation's old_state should match the last operation's new_state
                # This means it's a continuation of the same editing session
                last_new_content = last_operation['new_state'].get('content', '')
                current_old_content = old_state.get('content', '')
                
                # Also check that the context is the same
                last_context = last_operation['new_state'].get('context', {})
                current_context = old_state.get('context', {})
                
                return (last_new_content == current_old_content and 
                        last_context == current_context)
            
            # For function/variable operations, typically don't coalesce as they're usually discrete
            # But we could add logic here if needed
            if operation_type in ['rename_function', 'rename_variable']:
                return False
            
            # For other operations, don't coalesce by default
            return False
                    
        except Exception as e:
            logger.warning(f"Error checking coalesce eligibility: {e}")
            return False
    
    @staticmethod
    def undo_last_operation(session_id: str) -> Dict[str, Any]:
        """
        Undo the most recent operation for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Result with operation details and restored state
        """
        if session_id not in HistoryService._session_histories:
            return {
                'success': False,
                'error': 'No history found for session'
            }
        
        session_history = HistoryService._session_histories[session_id]
        
        if not session_history['undo_stack']:
            return {
                'success': False,
                'error': 'No operations to undo'
            }
        
        operation = session_history['undo_stack'].pop()
        session_history['redo_stack'].append(operation)
        
        logger.info(f"Undoing operation {operation['type']} with ID {operation['id']} for session {session_id}")
        
        return {
            'success': True,
            'operation': operation,
            'restored_state': operation['old_state'],
            'can_undo': len(session_history['undo_stack']) > 0,
            'can_redo': len(session_history['redo_stack']) > 0
        }
    
    @staticmethod
    def redo_last_operation(session_id: str) -> Dict[str, Any]:
        """
        Redo the most recently undone operation for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Result with operation details and restored state
        """
        if session_id not in HistoryService._session_histories:
            return {
                'success': False,
                'error': 'No history found for session'
            }
        
        session_history = HistoryService._session_histories[session_id]
        
        if not session_history['redo_stack']:
            return {
                'success': False,
                'error': 'No operations to redo'
            }
        
        operation = session_history['redo_stack'].pop()
        session_history['undo_stack'].append(operation)
        
        logger.info(f"Redoing operation {operation['type']} with ID {operation['id']} for session {session_id}")
        
        return {
            'success': True,
            'operation': operation,
            'restored_state': operation['new_state'],
            'can_undo': len(session_history['undo_stack']) > 0,
            'can_redo': len(session_history['redo_stack']) > 0
        }
    
    @staticmethod
    def get_history_state(session_id: str) -> Dict[str, Any]:
        """
        Get the current state of undo/redo stacks for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            History state information
        """
        if session_id not in HistoryService._session_histories:
            return {
                'can_undo': False,
                'can_redo': False,
                'undo_count': 0,
                'redo_count': 0,
                'operations': []
            }
        
        session_history = HistoryService._session_histories[session_id]
        
        return {
            'can_undo': len(session_history['undo_stack']) > 0,
            'can_redo': len(session_history['redo_stack']) > 0,
            'undo_count': len(session_history['undo_stack']),
            'redo_count': len(session_history['redo_stack']),
            'operations': [
                {
                    'id': op['id'],
                    'type': op['type'],
                    'timestamp': op['timestamp'],
                    'metadata': op.get('metadata', {})
                }
                for op in session_history['undo_stack']
            ]
        }
    
    @staticmethod
    def clear_history(session_id: str) -> Dict[str, Any]:
        """
        Clear all history for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Success status
        """
        if session_id in HistoryService._session_histories:
            del HistoryService._session_histories[session_id]
        
        logger.info(f"Cleared history for session {session_id}")
        
        return {
            'success': True,
            'message': 'History cleared'
        }
    
    @staticmethod
    def get_operation_by_id(session_id: str, operation_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific operation by ID.
        
        Args:
            session_id: Session identifier
            operation_id: Operation identifier
            
        Returns:
            Operation details or None if not found
        """
        if session_id not in HistoryService._session_histories:
            return None
        
        session_history = HistoryService._session_histories[session_id]
        
        # Search in both undo and redo stacks
        all_operations = session_history['undo_stack'] + session_history['redo_stack']
        
        for operation in all_operations:
            if operation['id'] == operation_id:
                return operation
        
        return None
    
    @staticmethod
    def undo_specific_operation(session_id: str, operation_id: str) -> Dict[str, Any]:
        """
        Undo a specific operation by ID.
        
        Args:
            session_id: Session identifier
            operation_id: Operation identifier
            
        Returns:
            Result with operation details and restored state
        """
        operation = HistoryService.get_operation_by_id(session_id, operation_id)
        
        if not operation:
            return {
                'success': False,
                'error': 'Operation not found'
            }
        
        # For now, we only support undoing the most recent operation
        # Future enhancement could support undoing specific operations in the middle
        if session_id in HistoryService._session_histories:
            session_history = HistoryService._session_histories[session_id]
            if (session_history['undo_stack'] and 
                session_history['undo_stack'][-1]['id'] == operation_id):
                return HistoryService.undo_last_operation(session_id)
        
        return {
            'success': False,
            'error': 'Can only undo the most recent operation'
        }
    
    @staticmethod
    def redo_specific_operation(session_id: str, operation_id: str) -> Dict[str, Any]:
        """
        Redo a specific operation by ID.
        
        Args:
            session_id: Session identifier
            operation_id: Operation identifier
            
        Returns:
            Result with operation details and restored state
        """
        operation = HistoryService.get_operation_by_id(session_id, operation_id)
        
        if not operation:
            return {
                'success': False,
                'error': 'Operation not found'
            }
        
        # For now, we only support redoing the most recent undone operation
        if session_id in HistoryService._session_histories:
            session_history = HistoryService._session_histories[session_id]
            if (session_history['redo_stack'] and 
                session_history['redo_stack'][-1]['id'] == operation_id):
                return HistoryService.redo_last_operation(session_id)
        
        return {
            'success': False,
            'error': 'Can only redo the most recent undone operation'
        } 