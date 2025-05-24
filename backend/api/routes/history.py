#!/usr/bin/env python3
"""
History management API routes.
Handles undo/redo operations and history state management.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from backend.services.history_service import HistoryService

logger = logging.getLogger(__name__)
router = APIRouter()

# Request/Response models
class RecordOperationRequest(BaseModel):
    session_id: str
    operation_type: str
    operation_data: Dict[str, Any]
    old_state: Dict[str, Any]
    new_state: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None

class RecordOperationResponse(BaseModel):
    success: bool
    operation_id: Optional[str] = None
    message: Optional[str] = None

class HistoryRequest(BaseModel):
    session_id: str

class UndoRedoRequest(BaseModel):
    session_id: str
    operation_id: Optional[str] = None

class HistoryOperationResponse(BaseModel):
    success: bool
    operation: Optional[Dict[str, Any]] = None
    restored_state: Optional[Dict[str, Any]] = None
    can_undo: Optional[bool] = None
    can_redo: Optional[bool] = None
    error: Optional[str] = None

class HistoryStateResponse(BaseModel):
    can_undo: bool
    can_redo: bool
    undo_count: int
    redo_count: int
    operations: List[Dict[str, Any]]

class ClearHistoryResponse(BaseModel):
    success: bool
    message: str

@router.post("/record", response_model=RecordOperationResponse)
async def record_operation(request: RecordOperationRequest):
    """Record an operation for undo/redo functionality"""
    try:
        operation_id = HistoryService.record_operation(
            session_id=request.session_id,
            operation_type=request.operation_type,
            operation_data=request.operation_data,
            old_state=request.old_state,
            new_state=request.new_state,
            metadata=request.metadata
        )
        
        return RecordOperationResponse(
            success=True,
            operation_id=operation_id,
            message=f"Operation {request.operation_type} recorded successfully"
        )
        
    except Exception as e:
        logger.error(f"Error recording operation: {str(e)}")
        return RecordOperationResponse(
            success=False,
            operation_id="",
            message=f"Failed to record operation: {str(e)}"
        )

@router.post("/undo", response_model=HistoryOperationResponse)
async def undo_operation(request: UndoRedoRequest):
    """Undo the last operation for a session"""
    try:
        result = HistoryService.undo_last_operation(request.session_id)
        
        if not result['success']:
            return HistoryOperationResponse(
                success=False,
                error=result['error']
            )
        
        return HistoryOperationResponse(
            success=True,
            operation=result['operation'],
            restored_state=result['restored_state'],
            can_undo=result.get('can_undo', False),
            can_redo=result.get('can_redo', False)
        )
        
    except Exception as e:
        logger.error(f"Error during undo: {str(e)}")
        return HistoryOperationResponse(
            success=False,
            error=str(e)
        )

@router.post("/redo", response_model=HistoryOperationResponse)
async def redo_operation(request: UndoRedoRequest):
    """Redo the last undone operation for a session"""
    try:
        result = HistoryService.redo_last_operation(request.session_id)
        
        if not result['success']:
            return HistoryOperationResponse(
                success=False,
                error=result['error']
            )
        
        return HistoryOperationResponse(
            success=True,
            operation=result['operation'],
            restored_state=result['restored_state'],
            can_undo=result.get('can_undo', False),
            can_redo=result.get('can_redo', False)
        )
        
    except Exception as e:
        logger.error(f"Error during redo: {str(e)}")
        return HistoryOperationResponse(
            success=False,
            error=str(e)
        )

@router.post("/state", response_model=HistoryStateResponse)
async def get_history_state(request: HistoryRequest):
    """Get the current history state for a session"""
    try:
        state = HistoryService.get_history_state(request.session_id)
        
        return HistoryStateResponse(
            can_undo=state['can_undo'],
            can_redo=state['can_redo'],
            undo_count=state['undo_count'],
            redo_count=state['redo_count'],
            operations=state['operations']
        )
        
    except Exception as e:
        logger.error(f"Error getting history state: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get history state: {str(e)}")

@router.post("/clear", response_model=ClearHistoryResponse)
async def clear_history(request: HistoryRequest):
    """Clear all history for a session"""
    try:
        result = HistoryService.clear_history(request.session_id)
        
        return ClearHistoryResponse(
            success=result['success'],
            message=result['message']
        )
        
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        return ClearHistoryResponse(
            success=False,
            message=f"Error: {str(e)}"
        ) 