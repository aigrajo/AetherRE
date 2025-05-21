#!/usr/bin/env python3
import sys
import json
import os
import subprocess
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional

from backend.api.models.chat import ChatRequest, ChatResponse, SessionResponse, SessionListResponse
from backend.services.chat import (
    stream_chat_response, 
    create_new_session, 
    clear_session, 
    delete_session, 
    get_all_sessions,
    chat_sessions,
    ChatSession
)
from backend.config.settings import DATA_DIR, GHIDRA_HEADLESS_SCRIPT
from backend.utils.helpers import analyze_xrefs

router = APIRouter(prefix="/api/chat")

@router.post("")
async def chat_endpoint(request: ChatRequest):
    """Chat endpoint for sending messages to the AI assistant."""
    try:
        print(f"[Chat API] Received request: {request.message}", file=sys.stderr)
        
        # Get function and context information from the request
        function_name = request.context.get('functionName', 'Unknown Function')
        active_context = []
        
        # Get active context toggles
        for key, value in request.context.items():
            if key.startswith('toggle_') and value:
                active_context.append(key.replace('toggle_', ''))
        
        # Create or get session
        if request.session_id not in chat_sessions:
            chat_sessions[request.session_id] = ChatSession(request.session_id)
            
        # Set function and context information
        chat_sessions[request.session_id].function_name = function_name
        chat_sessions[request.session_id].active_context = active_context
        
        return StreamingResponse(
            stream_chat_response(request.message, request.context, request.session_id),
            media_type="text/event-stream"
        )
    except Exception as e:
        print(f"[Chat API] Error handling request: {str(e)}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/new")
async def new_chat():
    """Create a new chat session."""
    # Don't create a session immediately, just return a temporary ID
    # The actual session will be created when the first message is sent
    temp_id = create_new_session()
    return SessionResponse(status="success", session_id=temp_id)

@router.post("/{session_id}/clear")
async def clear_chat(session_id: str):
    """Clear a chat session's history."""
    if clear_session(session_id):
        return SessionResponse(status="success")
    raise HTTPException(status_code=404, detail="Chat session not found")

@router.delete("/{session_id}")
async def delete_chat(session_id: str):
    """Delete a chat session."""
    if delete_session(session_id):
        return SessionResponse(status="success")
    raise HTTPException(status_code=404, detail="Chat session not found")

@router.get("/sessions")
async def list_sessions():
    """List all active chat sessions."""
    sessions = get_all_sessions()
    return SessionListResponse(sessions=sessions)

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