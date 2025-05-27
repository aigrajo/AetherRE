#!/usr/bin/env python3
import sys
import json
import os
import subprocess
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional

from backend.api.models.chat import (
    ChatRequest, ChatResponse, SessionResponse, SessionListResponse, 
    FunctionContextRequest, ErrorResponse
)
from backend.services.chat import (
    stream_chat_response, 
    create_new_session, 
    clear_session, 
    delete_session, 
    get_all_sessions,
    chat_sessions,
    ChatSession
)
from backend.services.function_context import function_context_service
from backend.services.session_manager import session_manager
from backend.config.settings import DATA_DIR, GHIDRA_HEADLESS_SCRIPT
from backend.utils.helpers import analyze_xrefs
from backend.services.note_integration_service import note_integration_service

router = APIRouter(prefix="/api/chat")

@router.post("")
async def chat_endpoint(request: ChatRequest):
    """Chat endpoint for sending messages to the AI assistant."""
    try:
        print(f"[Chat API] Received request: {request.message}", file=sys.stderr)
        print(f"[Chat API] Use AI tools: {request.use_ai_tools}", file=sys.stderr)
        if not request.use_ai_tools:
            print(f"[Chat API] Toggle states: {request.toggle_states}", file=sys.stderr)
        print(f"[Chat API] Session ID: {request.session_id}", file=sys.stderr)
        print(f"[Chat API] Function ID: {request.function_id}", file=sys.stderr)
        
        # Use the simplified streaming response with new services
        async def generate():
            async for chunk in stream_chat_response(
                message=request.message,
                session_id=request.session_id,
                toggle_states=request.toggle_states,
                dynamic_content=request.dynamic_content,
                function_id=request.function_id,
                use_ai_tools=request.use_ai_tools
            ):
                yield chunk
            
            # Send completion marker
            yield "data: [DONE]\n\n"
        
        return StreamingResponse(generate(), media_type="text/plain")
        
    except Exception as e:
        print(f"[Chat API] Error in chat endpoint: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="internal_error",
            message=f"An error occurred while processing your request: {str(e)}",
            suggestions=["Please try again", "Check backend logs for details"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.post("/context")
async def set_function_context(request: FunctionContextRequest):
    """Set the context data for a function."""
    try:
        print(f"[Chat API] Setting context for function: {request.function_id}", file=sys.stderr)
        
        function_context_service.set_current_function(request.function_id, request.data)
        
        return {"status": "success", "message": f"Context set for function {request.function_id}"}
        
    except Exception as e:
        print(f"[Chat API] Error setting function context: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="context_error",
            message=f"Failed to set function context: {str(e)}",
            suggestions=["Verify function data format", "Check backend logs"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.get("/context/{function_id}")
async def get_function_context(function_id: str):
    """Get available context for a function."""
    try:
        if function_id not in function_context_service.current_function_data:
            raise HTTPException(status_code=404, detail="Function context not found")
        
        data = function_context_service.current_function_data[function_id]
        
        # Return summary information about available context
        context_summary = {
            "function_id": function_id,
            "function_name": data.get('function_name'),
            "address": data.get('address'),
            "binary_name": data.get('binary_name'),
            "available_data": {
                "assembly": len(data.get('assembly', [])),
                "variables": len(data.get('variables', [])),
                "strings": len(data.get('strings', [])),
                "xrefs_incoming": len(data.get('xrefs', {}).get('incoming', [])),
                "xrefs_outgoing": len(data.get('xrefs', {}).get('outgoing', [])),
                "cfg_nodes": len(data.get('cfg', {}).get('nodes', [])),
                "cfg_edges": len(data.get('cfg', {}).get('edges', [])),
                "has_pseudocode": bool(data.get('pseudocode', '')),
            },
            "cached_at": data.get('cached_at')
        }
        
        return context_summary
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Chat API] Error getting function context: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="context_error",
            message=f"Failed to get function context: {str(e)}",
            suggestions=["Verify function exists", "Check backend logs"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.post("/new")
async def new_chat():
    """Create a new chat session."""
    try:
        temp_id = create_new_session()
        session_manager.set_current_session(temp_id)
        return SessionResponse(status="success", session_id=temp_id)
    except Exception as e:
        print(f"[Chat API] Error creating new chat: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="session_error",
            message=f"Failed to create new chat session: {str(e)}",
            suggestions=["Try again", "Check backend logs"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.post("/{session_id}/clear")
async def clear_chat(session_id: str):
    """Clear a chat session's history."""
    try:
        if clear_session(session_id):
            return SessionResponse(status="success")
        raise HTTPException(status_code=404, detail="Chat session not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Chat API] Error clearing chat: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="session_error",
            message=f"Failed to clear chat session: {str(e)}",
            suggestions=["Verify session exists", "Try again"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.delete("/sessions/{session_id}")
async def delete_chat(session_id: str):
    """Delete a chat session."""
    try:
        if delete_session(session_id):
            session_manager.clear_session_associations(session_id)
            return SessionResponse(status="success")
        raise HTTPException(status_code=404, detail="Chat session not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Chat API] Error deleting chat: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="session_error",
            message=f"Failed to delete chat session: {str(e)}",
            suggestions=["Verify session exists", "Try again"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.get("/sessions")
async def list_sessions():
    """List all active chat sessions."""
    try:
        sessions = get_all_sessions()
        return SessionListResponse(sessions=sessions)
    except Exception as e:
        print(f"[Chat API] Error listing sessions: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="session_error",
            message=f"Failed to list chat sessions: {str(e)}",
            suggestions=["Try again", "Check backend logs"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.get("/current")
async def get_current_session():
    """Get the current active session."""
    try:
        current_session_id = session_manager.get_current_session()
        if current_session_id:
            return {"session_id": current_session_id, "status": "active"}
        else:
            return {"session_id": None, "status": "none"}
    except Exception as e:
        print(f"[Chat API] Error getting current session: {str(e)}", file=sys.stderr)
        error_response = ErrorResponse(
            error_type="session_error",
            message=f"Failed to get current session: {str(e)}",
            suggestions=["Try again", "Check backend logs"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

@router.post("/restore")
async def restore_chat_session(request: dict):
    """Restore a chat session from project data."""
    try:
        session_id = request.get('session_id')
        name = request.get('name')
        created_at = request.get('created_at')
        last_activity = request.get('last_activity')
        messages = request.get('messages', [])
        
        if not session_id:
            raise HTTPException(status_code=400, detail="Session ID is required")
        
        # Create a new ChatSession object with the restored data
        from datetime import datetime
        
        restored_session = ChatSession(session_id=session_id)
        
        # Set the name separately since constructor doesn't accept it
        restored_session.name = name or f"Restored Chat {session_id[:8]}"
        
        # Mark as restored session for special cleanup handling
        restored_session.is_restored = True
        
        # Restore the timestamps - preserve original timestamps from project file
        if created_at:
            try:
                restored_session.created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except ValueError:
                print(f"[Chat] Warning: Could not parse created_at timestamp: {created_at}", file=sys.stderr)
                pass  # Use default if parsing fails
                
        if last_activity:
            try:
                restored_session.last_activity = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
            except ValueError:
                print(f"[Chat] Warning: Could not parse last_activity timestamp: {last_activity}", file=sys.stderr)
                pass  # Use default if parsing fails
        
        # Restore the messages
        restored_session.messages = messages
        
        print(f"[Chat] Restored session {session_id} with {len(messages)} messages (created: {restored_session.created_at}, last_activity: {restored_session.last_activity})", file=sys.stderr)
        
        # Add to the global sessions dictionary
        chat_sessions[session_id] = restored_session
        
        return {"status": "success", "message": f"Session {session_id} restored successfully"}
        
    except Exception as e:
        print(f"Error restoring chat session: {e}")
        error_response = ErrorResponse(
            error_type="restore_error",
            message=f"Failed to restore chat session: {str(e)}",
            suggestions=["Verify session data format", "Try again"]
        )
        raise HTTPException(status_code=500, detail=error_response.dict())

# Binary analysis endpoints
@router.post("/analyze")
async def analyze_binary(binary_path: str):
    """Analyze a binary file using Ghidra."""
    try:
        print(f"[DEBUG] analyze_binary called with: {binary_path}", file=sys.stderr, flush=True)
        binary_dir = os.path.dirname(binary_path)
        binary_name = os.path.basename(binary_path)
        output_json = os.path.join(DATA_DIR, f"{binary_name}_functions.json")
        print(f"[DEBUG] headless_script: {GHIDRA_HEADLESS_SCRIPT}", file=sys.stderr, flush=True)
        print(f"[DEBUG] output_json: {output_json}", file=sys.stderr, flush=True)
        print(f"[DEBUG] output_dir: {DATA_DIR}", file=sys.stderr, flush=True)
        print(f"[DEBUG] Running: {GHIDRA_HEADLESS_SCRIPT} {binary_path}", file=sys.stderr, flush=True)

        # Progress reporting
        async def progress_stream():
            yield json.dumps({"type": "progress", "progress": 10}) + "\n"
            
            env = os.environ.copy()
            env['GHIDRA_OUTPUT_DIR'] = DATA_DIR

            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            process = subprocess.Popen(
                [GHIDRA_HEADLESS_SCRIPT, "-binary", binary_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                cwd=project_root,
                bufsize=1  # line-buffered
            )

            progress_re = re.compile(r'\[PROGRESS\] (\d+)/(\d+)')
            
            # Read progress from stdout
            while True:
                line = process.stdout.readline()
                if not line:
                    break
                print(f"[BACKEND DEBUG] {line.strip()}", file=sys.stderr, flush=True)
                match = progress_re.search(line)
                if match:
                    processed = int(match.group(1))
                    total = int(match.group(2))
                    percent = int((processed / total) * 100)
                    yield json.dumps({"type": "progress", "progress": percent}) + "\n"

            # Read progress from stderr
            while True:
                line = process.stderr.readline()
                if not line:
                    break
                print(f"[BACKEND DEBUG] {line.strip()}", file=sys.stderr, flush=True)
                match = progress_re.search(line)
                if match:
                    processed = int(match.group(1))
                    total = int(match.group(2))
                    percent = int((processed / total) * 100)
                    yield json.dumps({"type": "progress", "progress": percent}) + "\n"

            process.wait()
            print(f"[DEBUG] Return code: {process.returncode}", file=sys.stderr, flush=True)
            
            # Read the rest of stdout and stderr for debugging
            if process.stdout:
                for line in process.stdout:
                    print(f"[DEBUG] STDOUT: {line.strip()}", file=sys.stderr, flush=True)
            if process.stderr:
                for line in process.stderr:
                    print(f"[DEBUG] STDERR: {line.strip()}", file=sys.stderr, flush=True)

            yield json.dumps({"type": "progress", "progress": 90}) + "\n"

            if process.returncode != 0:
                yield json.dumps({
                    "type": "error",
                    "message": f"Analysis failed: see logs for details"
                }) + "\n"
                return

            if not os.path.exists(output_json):
                yield json.dumps({
                    "type": "error",
                    "message": f"JSON output not found: {output_json}"
                }) + "\n"
                return

            print(f"[DEBUG] JSON file found: {output_json}", file=sys.stderr, flush=True)

            with open(output_json, 'r') as f:
                data = json.load(f)

            xref_data = analyze_xrefs(binary_path, data)

            # If data is a list, wrap it in a dict
            if isinstance(data, list):
                result = {
                    "functions": data,
                    "cross_references": xref_data
                }
            else:
                data["cross_references"] = xref_data
                result = data

            yield json.dumps({
                "type": "analysis_complete",
                "data": result,
                "path": output_json,
                "filename": os.path.basename(output_json)
            }) + "\n"

        return StreamingResponse(
            progress_stream(),
            media_type="application/json"
        )

    except Exception as e:
        print(f"[DEBUG] Error: {str(e)}", file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze/json")
async def analyze_json(json_data: str):
    """Analyze JSON data with xref information."""
    try:
        data = json.loads(json_data)
        xref_data = analyze_xrefs(None, data)
        
        if isinstance(data, list):
            result = {
                "functions": data,
                "cross_references": xref_data
            }
        else:
            data["cross_references"] = xref_data
            result = data
            
        return {"type": "analysis_complete", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save-analysis")
async def save_analysis_to_notes(request: dict):
    """Save AI analysis result to notes"""
    try:
        analysis_type = request.get("analysis_type")
        content = request.get("content")
        metadata = request.get("metadata", {})
        custom_title = request.get("custom_title")
        
        if not analysis_type or not content:
            raise HTTPException(status_code=400, detail="Missing required fields: analysis_type, content")
        
        result = await note_integration_service.save_analysis_result(
            analysis_type=analysis_type,
            content=content,
            metadata=metadata,
            custom_title=custom_title
        )
        
        return result
        
    except Exception as e:
        print(f"[Chat API] Error saving analysis to notes: {str(e)}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to save analysis: {str(e)}")

@router.get("/saved-notes")
async def get_saved_notes():
    """Get all saved analysis notes"""
    try:
        notes = note_integration_service.get_saved_notes()
        return {"success": True, "notes": notes}
    except Exception as e:
        print(f"[Chat API] Error getting saved notes: {str(e)}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to get saved notes: {str(e)}") 