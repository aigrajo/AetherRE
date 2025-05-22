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
from backend.services.notes_service import get_note, get_tags

router = APIRouter(prefix="/api/chat")

@router.post("")
async def chat_endpoint(request: ChatRequest):
    """Chat endpoint for sending messages to the AI assistant."""
    try:
        print(f"[Chat API] Received request: {request.message}", file=sys.stderr)
        
        # Get function and context information from the request
        function_name = request.context.get('functionName', 'Unknown Function')
        binary_name = None
        function_id = None
        
        # Log toggle states
        toggles = {k: v for k, v in request.context.items() if k.startswith('toggle_')}
        print(f"[Chat API] Toggle states: {toggles}", file=sys.stderr)
        
        # Check if we have direct binary name and function ID from context
        binary_name = request.context.get('binaryName')
        function_id = request.context.get('functionId')
        
        if binary_name and function_id:
            print(f"[Chat API] Using binary/function from context: {binary_name}/{function_id}", file=sys.stderr)
        else:
            # Check if address is present in context
            function_address = request.context.get('address')
            if function_address:
                # Remove '0x' prefix if present and convert to lowercase
                function_id = function_address.replace('0x', '').lower()
                print(f"[Chat API] Using function ID from address: {function_id}", file=sys.stderr)
                
                # For binary name, derive from function name or address
                binary_name = request.context.get('binaryName')
                if not binary_name and function_name:
                    # Try to extract binary name from function name if it has format like "binary_name::function_name"
                    if '::' in function_name:
                        binary_name = function_name.split('::')[0]
                        print(f"[Chat API] Extracted binary name from function name: {binary_name}", file=sys.stderr)
                
                if not binary_name and function_id:
                    # Use a default binary name based on the first part of the function ID
                    binary_name = f"binary_{function_id[:8]}"
                    print(f"[Chat API] Using default binary name: {binary_name}", file=sys.stderr)
                
                # Clean binary name to ensure proper filesystem compatibility
                if binary_name:
                    binary_name = ''.join(c if c.isalnum() else '_' for c in binary_name)
                    print(f"[Chat API] Cleaned binary name: {binary_name}", file=sys.stderr)
        
        # Check if notes toggle is enabled
        if request.context.get('toggle_notes') == True:
            print(f"[Chat API] Notes toggle is enabled", file=sys.stderr)
            # Only attempt to get notes if we have binary name and function ID
            if binary_name and function_id:
                # No need to add notes again if already included
                if request.context.get('notes') is None:
                    try:
                        note_content = get_note(binary_name, function_id)
                        if note_content:
                            request.context['notes'] = note_content
                            print(f"[Chat API] Added notes for {binary_name}/{function_id}: {note_content[:50]}...", file=sys.stderr)
                        else:
                            print(f"[Chat API] No notes found for {binary_name}/{function_id}", file=sys.stderr)
                    except Exception as e:
                        print(f"[Chat API] Error getting notes: {str(e)}", file=sys.stderr)
                else:
                    print(f"[Chat API] Notes already included in context", file=sys.stderr)
            else:
                print(f"[Chat API] Missing binary name or function ID for notes", file=sys.stderr)
        else:
            print(f"[Chat API] Notes toggle is disabled", file=sys.stderr)
        
        # Always check for AI context tags (no toggle needed)
        print(f"[Chat API] Checking for AI context tags", file=sys.stderr)
        if binary_name and function_id:
            try:
                tags = get_tags(binary_name, function_id)
                print(f"[Chat API] Found {len(tags)} tags for {binary_name}/{function_id}", file=sys.stderr)
                # Only include tags marked for AI context
                ai_context_tags = [tag for tag in tags if tag.get('includeInAI')]
                if ai_context_tags:
                    # Only include type and value fields
                    request.context['tags'] = [{'type': tag['type'], 'value': tag['value']} for tag in ai_context_tags]
                    print(f"[Chat API] Added {len(ai_context_tags)} AI context tags", file=sys.stderr)
                else:
                    print(f"[Chat API] No tags with includeInAI flag found", file=sys.stderr)
            except Exception as e:
                print(f"[Chat API] Error getting tags: {str(e)}", file=sys.stderr)
        else:
            print(f"[Chat API] Missing binary name or function ID for tags", file=sys.stderr)
        
        # Get active context toggles
        active_context = []
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