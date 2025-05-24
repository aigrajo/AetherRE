#!/usr/bin/env python3
"""
Comprehensive variable rename service.
Handles validation, pseudocode updates, state management, and history tracking.
"""

import re
import uuid
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import logging

from .validation_service import ValidationService

logger = logging.getLogger(__name__)

class VariableRenameService:
    """Service for comprehensive variable renaming operations"""
    
    # In-memory history storage (could be replaced with persistent storage)
    _history_store = {}
    
    @staticmethod
    def rename_variable(
        old_name: str,
        new_name: str,
        current_function: Dict[str, Any],
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Comprehensive variable rename operation.
        
        Args:
            old_name: Current variable name
            new_name: New variable name
            current_function: Current function data containing local variables
            session_id: Optional session ID for history tracking
            
        Returns:
            Dict with success status, updated data, and operation details
        """
        logger.info(f"Starting variable rename: '{old_name}' -> '{new_name}'")
        
        try:
            # 1. Validation
            function_id = current_function.get('address') or current_function.get('id')
            if not function_id:
                return {
                    'success': False,
                    'error': 'Current function has no address or ID'
                }
            
            is_valid, error = ValidationService.validate_variable_name(
                old_name,
                new_name,
                current_function.get('local_variables', []),
                current_function.get('pseudocode')
            )
            
            if not is_valid:
                return {
                    'success': False,
                    'error': error
                }
            
            # 2. Create operation snapshot for history
            operation_id = str(uuid.uuid4())
            old_state = VariableRenameService._create_state_snapshot(
                current_function, old_name
            )
            
            # 3. Update variable name in local variables
            updated_current_function = current_function.copy()
            updated_local_variables = VariableRenameService._update_local_variables(
                current_function.get('local_variables', []),
                old_name,
                new_name
            )
            updated_current_function['local_variables'] = updated_local_variables
            
            # 4. Update pseudocode
            updated_pseudocode = VariableRenameService._update_pseudocode(
                current_function.get('pseudocode', ''),
                old_name,
                new_name
            )
            updated_current_function['pseudocode'] = updated_pseudocode
            
            # 5. Create new state snapshot
            new_state = VariableRenameService._create_state_snapshot(
                updated_current_function, new_name
            )
            
            # 6. Store operation in history
            if session_id:
                VariableRenameService._store_operation(
                    session_id, operation_id, old_state, new_state, function_id
                )
            
            logger.info(f"Variable rename completed successfully: '{old_name}' -> '{new_name}'")
            
            return {
                'success': True,
                'updated_current_function': updated_current_function,
                'operation_id': operation_id,
                'changes': {
                    'variable_name': {'old': old_name, 'new': new_name},
                    'pseudocode_updated': updated_pseudocode != current_function.get('pseudocode', ''),
                    'local_variables_updated': True
                }
            }
            
        except Exception as e:
            logger.error(f"Error during variable rename: {str(e)}")
            return {
                'success': False,
                'error': f'Internal error: {str(e)}'
            }
    
    @staticmethod
    def _update_pseudocode(pseudocode: str, old_name: str, new_name: str) -> str:
        """
        Update pseudocode by replacing variable names using sophisticated regex.
        
        Args:
            pseudocode: Original pseudocode
            old_name: Variable name to replace
            new_name: New variable name
            
        Returns:
            Updated pseudocode
        """
        if not pseudocode or not old_name:
            return pseudocode
        
        try:
            # Create a regex that matches the variable name as a whole word
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
    def _update_local_variables(
        local_variables: List[Dict[str, Any]],
        old_name: str,
        new_name: str
    ) -> List[Dict[str, Any]]:
        """
        Update local variables list with new variable name.
        
        Args:
            local_variables: Original local variables list
            old_name: Old variable name
            new_name: New variable name
            
        Returns:
            Updated local variables list
        """
        if not local_variables:
            return local_variables
        
        updated_variables = []
        for variable in local_variables:
            var_copy = variable.copy()
            
            # Update the variable being renamed
            if var_copy.get('name') == old_name:
                # Set original name for tracking if not already set
                if not var_copy.get('originalName'):
                    var_copy['originalName'] = old_name
                var_copy['name'] = new_name
            
            updated_variables.append(var_copy)
        
        return updated_variables
    
    @staticmethod
    def _create_state_snapshot(
        current_function: Dict[str, Any],
        variable_name: str
    ) -> Dict[str, Any]:
        """
        Create a state snapshot for history tracking.
        
        Args:
            current_function: Current function data
            variable_name: Variable name at this state
            
        Returns:
            State snapshot
        """
        return {
            'variable_name': variable_name,
            'function_id': current_function.get('address') or current_function.get('id'),
            'pseudocode': current_function.get('pseudocode', ''),
            'current_function': current_function.copy(),
            'local_variables': current_function.get('local_variables', []).copy() if current_function.get('local_variables') else [],
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
        if session_id not in VariableRenameService._history_store:
            VariableRenameService._history_store[session_id] = []
        
        operation = {
            'id': operation_id,
            'type': 'rename_variable',
            'function_id': function_id,
            'old_state': old_state,
            'new_state': new_state,
            'timestamp': datetime.now().isoformat()
        }
        
        VariableRenameService._history_store[session_id].append(operation)
        
        # Limit history size to prevent memory issues
        max_history = 100
        if len(VariableRenameService._history_store[session_id]) > max_history:
            VariableRenameService._history_store[session_id] = \
                VariableRenameService._history_store[session_id][-max_history:]
    
    @staticmethod
    def get_operation_history(session_id: str) -> List[Dict[str, Any]]:
        """
        Get operation history for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            List of operations
        """
        return VariableRenameService._history_store.get(session_id, [])
    
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
        operations = VariableRenameService._history_store.get(session_id, [])
        
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
        operations = VariableRenameService._history_store.get(session_id, [])
        
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