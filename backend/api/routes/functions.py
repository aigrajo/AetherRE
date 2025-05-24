#!/usr/bin/env python3
"""
API endpoints for function operations.
"""

from fastapi import APIRouter, HTTPException, Header
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import logging

from backend.services.function_rename_service import FunctionRenameService
from backend.services.variable_rename_service import VariableRenameService

router = APIRouter(prefix="/api/functions")

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class FunctionRenameRequest(BaseModel):
    old_name: str
    new_name: str
    current_function: Dict[str, Any]
    functions_data: Dict[str, Any]

class VariableRenameRequest(BaseModel):
    old_name: str
    new_name: str
    current_function: Dict[str, Any]

class FunctionRenameResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    updated_current_function: Optional[Dict[str, Any]] = None
    updated_functions_data: Optional[Dict[str, Any]] = None
    operation_id: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None

class VariableRenameResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    updated_current_function: Optional[Dict[str, Any]] = None
    operation_id: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None

class HistoryRequest(BaseModel):
    session_id: str

class UndoRedoRequest(BaseModel):
    session_id: str
    operation_id: str

class HistoryResponse(BaseModel):
    success: bool
    operations: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None

class UndoRedoResponse(BaseModel):
    success: bool
    restored_state: Optional[Dict[str, Any]] = None
    operation: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@router.post("/rename", response_model=FunctionRenameResponse)
async def rename_function(
    request: FunctionRenameRequest,
    session_id: Optional[str] = Header(None, alias="x-session-id")
):
    """
    Comprehensive function rename operation.
    Handles validation, pseudocode updates, state management, and history tracking.
    """
    try:
        logger.info(f"Function rename request: '{request.old_name}' -> '{request.new_name}'")
        logger.debug(f"Session ID: {session_id}")
        logger.debug(f"Current function: {request.current_function.get('name', 'unnamed')}")
        
        # Call the comprehensive rename service
        result = FunctionRenameService.rename_function(
            old_name=request.old_name,
            new_name=request.new_name,
            current_function=request.current_function,
            functions_data=request.functions_data,
            session_id=session_id
        )
        
        logger.debug(f"Rename result: success={result.get('success')}")
        
        return FunctionRenameResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in function rename: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rename-variable", response_model=VariableRenameResponse)
async def rename_variable(
    request: VariableRenameRequest,
    session_id: Optional[str] = Header(None, alias="x-session-id")
):
    """
    Comprehensive variable rename operation.
    Handles validation, pseudocode updates, state management, and history tracking.
    """
    try:
        logger.info(f"Variable rename request: '{request.old_name}' -> '{request.new_name}'")
        logger.debug(f"Session ID: {session_id}")
        logger.debug(f"Current function: {request.current_function.get('name', 'unnamed')}")
        
        # Call the comprehensive rename service
        result = VariableRenameService.rename_variable(
            old_name=request.old_name,
            new_name=request.new_name,
            current_function=request.current_function,
            session_id=session_id
        )
        
        logger.debug(f"Variable rename result: success={result.get('success')}")
        
        return VariableRenameResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in variable rename: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/history", response_model=HistoryResponse)
async def get_operation_history(request: HistoryRequest):
    """Get operation history for a session."""
    try:
        # Combine both function and variable operations
        function_operations = FunctionRenameService.get_operation_history(request.session_id)
        variable_operations = VariableRenameService.get_operation_history(request.session_id)
        
        # Merge and sort by timestamp
        all_operations = function_operations + variable_operations
        all_operations.sort(key=lambda x: x.get('timestamp', ''))
        
        return HistoryResponse(
            success=True,
            operations=all_operations
        )
        
    except Exception as e:
        logger.error(f"Error getting history: {str(e)}")
        return HistoryResponse(
            success=False,
            error=str(e)
        )

@router.post("/undo", response_model=UndoRedoResponse)
async def undo_operation(request: UndoRedoRequest):
    """Undo a specific operation."""
    try:
        # Try function undo first
        result = FunctionRenameService.undo_operation(
            request.session_id,
            request.operation_id
        )
        
        # If not found, try variable undo
        if not result.get('success'):
            result = VariableRenameService.undo_operation(
                request.session_id,
                request.operation_id
            )
        
        return UndoRedoResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in undo: {str(e)}")
        return UndoRedoResponse(
            success=False,
            error=str(e)
        )

@router.post("/redo", response_model=UndoRedoResponse)
async def redo_operation(request: UndoRedoRequest):
    """Redo a specific operation."""
    try:
        # Try function redo first
        result = FunctionRenameService.redo_operation(
            request.session_id,
            request.operation_id
        )
        
        # If not found, try variable redo
        if not result.get('success'):
            result = VariableRenameService.redo_operation(
                request.session_id,
                request.operation_id
            )
        
        return UndoRedoResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in redo: {str(e)}")
        return UndoRedoResponse(
            success=False,
            error=str(e)
        ) 