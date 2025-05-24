#!/usr/bin/env python3
"""
Comprehensive function rename service.
Handles validation, pseudocode updates, state management, and history tracking.
"""

import re
import uuid
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import logging

from .validation_service import ValidationService

logger = logging.getLogger(__name__)

class FunctionRenameService:
    """Service for comprehensive function renaming operations"""
    
    # In-memory history storage (could be replaced with persistent storage)
    _history_store = {}
    
    @staticmethod
    def rename_function(
        old_name: str,
        new_name: str,
        current_function: Dict[str, Any],
        functions_data: Dict[str, Any],
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Comprehensive function rename operation.
        
        Args:
            old_name: Current function name
            new_name: New function name
            current_function: Current function data
            functions_data: All functions data
            session_id: Optional session ID for history tracking
            
        Returns:
            Dict with success status, updated data, and operation details
        """
        logger.info(f"Starting function rename: '{old_name}' -> '{new_name}'")
        
        try:
            # 1. Validation
            function_id = current_function.get('address') or current_function.get('id')
            if not function_id:
                return {
                    'success': False,
                    'error': 'Current function has no address or ID'
                }
            
            is_valid, error = ValidationService.validate_function_name(
                old_name,
                new_name,
                functions_data,
                str(function_id),
                current_function.get('pseudocode')
            )
            
            if not is_valid:
                return {
                    'success': False,
                    'error': error
                }
            
            # 2. Create operation snapshot for history
            operation_id = str(uuid.uuid4())
            old_state = FunctionRenameService._create_state_snapshot(
                current_function, functions_data, old_name
            )
            
            # 3. Update function name in current function
            updated_current_function = current_function.copy()
            updated_current_function['name'] = new_name
            
            # Track original name if not already set
            if not updated_current_function.get('originalName'):
                updated_current_function['originalName'] = old_name
            
            # 4. Update pseudocode
            updated_pseudocode = FunctionRenameService._update_pseudocode(
                current_function.get('pseudocode', ''),
                old_name,
                new_name
            )
            updated_current_function['pseudocode'] = updated_pseudocode
            
            # 5. Update functions data
            updated_functions_data = FunctionRenameService._update_functions_data(
                functions_data,
                function_id,
                old_name,
                new_name
            )
            
            # 6. Create new state snapshot
            new_state = FunctionRenameService._create_state_snapshot(
                updated_current_function, updated_functions_data, new_name
            )
            
            # 7. Store operation in history
            if session_id:
                FunctionRenameService._store_operation(
                    session_id, operation_id, old_state, new_state, function_id
                )
            
            logger.info(f"Function rename completed successfully: '{old_name}' -> '{new_name}'")
            
            return {
                'success': True,
                'updated_current_function': updated_current_function,
                'updated_functions_data': updated_functions_data,
                'operation_id': operation_id,
                'changes': {
                    'function_name': {'old': old_name, 'new': new_name},
                    'pseudocode_updated': updated_pseudocode != current_function.get('pseudocode', ''),
                    'functions_data_updated': updated_functions_data != functions_data
                }
            }
            
        except Exception as e:
            logger.error(f"Error during function rename: {str(e)}")
            return {
                'success': False,
                'error': f'Internal error: {str(e)}'
            }
    
    @staticmethod
    def _update_pseudocode(pseudocode: str, old_name: str, new_name: str) -> str:
        """
        Update pseudocode by replacing function names using sophisticated regex.
        
        Args:
            pseudocode: Original pseudocode
            old_name: Function name to replace
            new_name: New function name
            
        Returns:
            Updated pseudocode
        """
        if not pseudocode or not old_name:
            return pseudocode
        
        try:
            # Create a regex that matches the function name as a whole word
            # This prevents partial matches within other identifiers
            regex = re.compile(r'\b' + re.escape(old_name) + r'\b')
            updated_pseudocode = regex.sub(new_name, pseudocode)
            
            logger.debug(f"Pseudocode update: {len(pseudocode)} -> {len(updated_pseudocode)} chars")
            
            # If no regex matches found, try direct replacement as fallback
            if updated_pseudocode == pseudocode and old_name in pseudocode:
                logger.debug("Regex didn't match, using direct string replacement as fallback")
                updated_pseudocode = pseudocode.replace(old_name, new_name)
            
            return updated_pseudocode
            
        except Exception as e:
            logger.error(f"Error updating pseudocode: {str(e)}")
            # Return original pseudocode if update fails
            return pseudocode
    
    @staticmethod
    def _update_functions_data(
        functions_data: Dict[str, Any],
        function_id: str,
        old_name: str,
        new_name: str
    ) -> Dict[str, Any]:
        """
        Update functions data with new function name.
        
        Args:
            functions_data: Original functions data
            function_id: ID of function being renamed
            old_name: Old function name
            new_name: New function name
            
        Returns:
            Updated functions data
        """
        if not functions_data:
            return functions_data
        
        updated_data = functions_data.copy()
        
        if 'functions' in updated_data:
            updated_functions = []
            for func in updated_data['functions']:
                func_copy = func.copy()
                
                # Update the function being renamed
                if str(func_copy.get('address', '')) == str(function_id) or func_copy.get('name') == old_name:
                    # Set original name for tracking if not already set
                    if not func_copy.get('originalName'):
                        func_copy['originalName'] = old_name
                    func_copy['name'] = new_name
                
                updated_functions.append(func_copy)
            
            updated_data['functions'] = updated_functions
        
        return updated_data
    
    @staticmethod
    def _create_state_snapshot(
        current_function: Dict[str, Any],
        functions_data: Dict[str, Any],
        function_name: str
    ) -> Dict[str, Any]:
        """
        Create a state snapshot for history tracking.
        
        Args:
            current_function: Current function data
            functions_data: Functions data
            function_name: Function name at this state
            
        Returns:
            State snapshot
        """
        return {
            'function_name': function_name,
            'function_id': current_function.get('address') or current_function.get('id'),
            'pseudocode': current_function.get('pseudocode', ''),
            'current_function': current_function.copy(),
            'functions_data': functions_data.copy() if functions_data else None,
            'timestamp': datetime.now().isoformat()
        }
    
    @staticmethod
    def _store_operation(
        session_id: str,
        operation_id: str,
        old_state: Dict[str, Any],
        new_state: Dict[str, Any],
        function_id: str
    ):
        """
        Store operation in history for undo/redo functionality.
        
        Args:
            session_id: Session identifier
            operation_id: Unique operation identifier
            old_state: State before operation
            new_state: State after operation
            function_id: Function identifier
        """
        if session_id not in FunctionRenameService._history_store:
            FunctionRenameService._history_store[session_id] = []
        
        operation = {
            'id': operation_id,
            'type': 'rename_function',
            'function_id': function_id,
            'old_state': old_state,
            'new_state': new_state,
            'timestamp': datetime.now().isoformat()
        }
        
        FunctionRenameService._history_store[session_id].append(operation)
        
        # Limit history size to prevent memory issues
        max_history = 100
        if len(FunctionRenameService._history_store[session_id]) > max_history:
            FunctionRenameService._history_store[session_id] = \
                FunctionRenameService._history_store[session_id][-max_history:]
    
    @staticmethod
    def get_operation_history(session_id: str) -> List[Dict[str, Any]]:
        """
        Get operation history for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            List of operations
        """
        return FunctionRenameService._history_store.get(session_id, [])
    
    @staticmethod
    def undo_operation(
        session_id: str,
        operation_id: str
    ) -> Dict[str, Any]:
        """
        Undo a specific operation.
        
        Args:
            session_id: Session identifier
            operation_id: Operation identifier to undo
            
        Returns:
            Undo result with restored state
        """
        operations = FunctionRenameService._history_store.get(session_id, [])
        
        for operation in reversed(operations):
            if operation['id'] == operation_id:
                old_state = operation['old_state']
                return {
                    'success': True,
                    'restored_state': old_state,
                    'operation': operation
                }
        
        return {
            'success': False,
            'error': 'Operation not found'
        }
    
    @staticmethod
    def redo_operation(
        session_id: str,
        operation_id: str
    ) -> Dict[str, Any]:
        """
        Redo a specific operation.
        
        Args:
            session_id: Session identifier
            operation_id: Operation identifier to redo
            
        Returns:
            Redo result with new state
        """
        operations = FunctionRenameService._history_store.get(session_id, [])
        
        for operation in operations:
            if operation['id'] == operation_id:
                new_state = operation['new_state']
                return {
                    'success': True,
                    'restored_state': new_state,
                    'operation': operation
                }
        
        return {
            'success': False,
            'error': 'Operation not found'
        } 