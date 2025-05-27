#!/usr/bin/env python3
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

# Pydantic models for request/response
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    toggle_states: Dict[str, bool] = {}
    dynamic_content: Optional[Dict[str, Any]] = None
    function_id: Optional[str] = None  # For associating session with function
    use_ai_tools: bool = False  # Whether to use AI interaction engine

class ChatResponse(BaseModel):
    reply: str
    session_id: str

class SessionInfo(BaseModel):
    session_id: str
    name: Optional[str]
    created_at: str
    last_activity: str
    message_count: int
    messages: List[Dict[str, str]]

class SessionListResponse(BaseModel):
    sessions: List[SessionInfo]

class SessionResponse(BaseModel):
    status: str
    session_id: Optional[str] = None

class FunctionContextRequest(BaseModel):
    function_id: str
    data: Dict[str, Any]

class ErrorResponse(BaseModel):
    error_type: str
    message: str
    suggestions: List[str] = []

# XRef models for binary analysis
class XRefType:
    DIRECT_CALL = "direct"
    INDIRECT_CALL = "indirect"
    JUMP = "jump"
    DATA = "data"
    IMPORT = "import"

class XRef:
    def __init__(self, 
                 source_func: str,
                 target_func: str,
                 xref_type: str,
                 offset: int,
                 context: str,
                 stack_state: Optional[str] = None):
        self.source_func = source_func
        self.target_func = target_func
        self.xref_type = xref_type
        self.offset = offset
        self.context = context
        self.stack_state = stack_state

    def to_dict(self) -> dict:
        return {
            "source_func": self.source_func,
            "target_func": self.target_func,
            "type": self.xref_type,
            "offset": self.offset,
            "context": self.context,
            "stack_state": self.stack_state
        } 