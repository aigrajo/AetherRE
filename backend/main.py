#!/usr/bin/env python3
import sys
import json
import os
import subprocess
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import openai
import hashlib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from pydantic import BaseModel
import time
from datetime import datetime, timedelta
from collections import deque
from dotenv import load_dotenv
import asyncio

# Load environment variables from .env file
load_dotenv()
print(f"[DEBUG] Environment variables loaded. OPENAI_API_KEY present: {bool(os.getenv('OPENAI_API_KEY'))}", file=sys.stderr)

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting configuration
RATE_LIMIT = {
    'requests_per_minute': 5,  # Maximum requests per minute
    'requests_per_hour': 50,   # Maximum requests per hour
    'requests_per_day': 250     # Maximum requests per day
}

# Rate limiting storage
request_timestamps = {
    'minute': deque(maxlen=RATE_LIMIT['requests_per_minute']),
    'hour': deque(maxlen=RATE_LIMIT['requests_per_hour']),
    'day': deque(maxlen=RATE_LIMIT['requests_per_day'])
}

def check_rate_limit():
    """Check if the current request exceeds rate limits."""
    now = datetime.now()
    
    # Clean up old timestamps
    for window in request_timestamps.values():
        while window and (now - window[0]) > timedelta(days=1):
            window.popleft()
    
    # Check minute limit
    minute_ago = now - timedelta(minutes=1)
    while request_timestamps['minute'] and request_timestamps['minute'][0] < minute_ago:
        request_timestamps['minute'].popleft()
    if len(request_timestamps['minute']) >= RATE_LIMIT['requests_per_minute']:
        return False, "Rate limit exceeded: Too many requests per minute"
    
    # Check hour limit
    hour_ago = now - timedelta(hours=1)
    while request_timestamps['hour'] and request_timestamps['hour'][0] < hour_ago:
        request_timestamps['hour'].popleft()
    if len(request_timestamps['hour']) >= RATE_LIMIT['requests_per_hour']:
        return False, "Rate limit exceeded: Too many requests per hour"
    
    # Check day limit
    day_ago = now - timedelta(days=1)
    while request_timestamps['day'] and request_timestamps['day'][0] < day_ago:
        request_timestamps['day'].popleft()
    if len(request_timestamps['day']) >= RATE_LIMIT['requests_per_day']:
        return False, "Rate limit exceeded: Too many requests per day"
    
    # Add current timestamp to all windows
    request_timestamps['minute'].append(now)
    request_timestamps['hour'].append(now)
    request_timestamps['day'].append(now)
    
    return True, None

# Pydantic models for request/response
class ChatRequest(BaseModel):
    message: str
    context: Dict[str, Any]
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    session_id: str

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

def analyze_xrefs(binary_path: str, function_data) -> dict:
    """Analyze cross-references for all functions in the binary."""
    # If function_data is a list, convert to dict by address
    if isinstance(function_data, list):
        function_data = {f['address']: f for f in function_data if 'address' in f}
        
        # Debug: Find entry points and their targets
        entry_points = []
        for addr, func in function_data.items():
            if func.get('name') in ['mainCRTStartup', '__tmainCRTStartup', 'main', '_main']:
                entry_points.append(func)
                print(f"[DEBUG] Found entry point: {func['name']} at {addr}", file=sys.stderr)
                
                # Check instructions for targets
                call_targets = []
                for instr in func.get('instructions', []):
                    if instr.get('type') == 'call' and 'target' in instr:
                        target = instr['target']
                        call_targets.append(target)
                        target_func = function_data.get(target)
                        target_name = target_func['name'] if target_func else 'UNKNOWN'
                        print(f"[DEBUG]   Calls: {target} -> {target_name}", file=sys.stderr)
                print(f"[DEBUG]   Found {len(call_targets)} call targets", file=sys.stderr)
        
        # Debug: Check overall call graph
        all_targets = set()
        for addr, func in function_data.items():
            for instr in func.get('instructions', []):
                if instr.get('type') == 'call' and 'target' in instr:
                    all_targets.add(instr['target'])
        
        target_match_count = sum(1 for t in all_targets if t in function_data)
        print(f"[DEBUG] Call graph: {len(all_targets)} unique targets, {target_match_count} match function addresses", file=sys.stderr)
    
    xrefs = {
        "incoming": {},  # function_address -> list of XRefs
        "outgoing": {}   # function_address -> list of XRefs
    }
    
    # Process each function
    for func_addr, func_data in function_data.items():
        if func_addr not in xrefs["incoming"]:
            xrefs["incoming"][func_addr] = []
        if func_addr not in xrefs["outgoing"]:
            xrefs["outgoing"][func_addr] = []
            
        # Analyze instructions for outgoing references
        for instr in func_data.get("instructions", []):
            # Direct calls
            if instr.get("type") == "call" and "target" in instr:
                target = instr["target"]
                if target in function_data:
                    xref = XRef(
                        source_func=func_addr,
                        target_func=target,
                        xref_type=XRefType.DIRECT_CALL,
                        offset=instr.get("offset", 0),
                        context=instr.get("disassembly", ""),
                        stack_state=instr.get("stack_state")
                    )
                    xrefs["outgoing"][func_addr].append(xref)
                    if target not in xrefs["incoming"]:
                        xrefs["incoming"][target] = []
                    xrefs["incoming"][target].append(xref)
            
            # Indirect calls
            elif instr.get("type") == "call" and "indirect" in instr:
                xref = XRef(
                    source_func=func_addr,
                    target_func="unknown",
                    xref_type=XRefType.INDIRECT_CALL,
                    offset=instr.get("offset", 0),
                    context=instr.get("disassembly", ""),
                    stack_state=instr.get("stack_state")
                )
                xrefs["outgoing"][func_addr].append(xref)
            
            # Jumps
            elif instr.get("type") == "jump" and "target" in instr:
                target = instr["target"]
                if target in function_data:
                    xref = XRef(
                        source_func=func_addr,
                        target_func=target,
                        xref_type=XRefType.JUMP,
                        offset=instr.get("offset", 0),
                        context=instr.get("disassembly", ""),
                        stack_state=instr.get("stack_state")
                    )
                    xrefs["outgoing"][func_addr].append(xref)
                    if target not in xrefs["incoming"]:
                        xrefs["incoming"][target] = []
                    xrefs["incoming"][target].append(xref)
            
            # Data references
            elif instr.get("type") == "data" and "target" in instr:
                target = instr["target"]
                if target in function_data:
                    xref = XRef(
                        source_func=func_addr,
                        target_func=target,
                        xref_type=XRefType.DATA,
                        offset=instr.get("offset", 0),
                        context=instr.get("disassembly", ""),
                        stack_state=instr.get("stack_state")
                    )
                    xrefs["outgoing"][func_addr].append(xref)
                    if target not in xrefs["incoming"]:
                        xrefs["incoming"][target] = []
                    xrefs["incoming"][target].append(xref)
    
    # Convert XRef objects to dictionaries
    return {
        "incoming": {k: [x.to_dict() for x in v] for k, v in xrefs["incoming"].items()},
        "outgoing": {k: [x.to_dict() for x in v] for k, v in xrefs["outgoing"].items()}
    }

def analyze_binary(binary_path):
    try:
        print(f"[DEBUG] analyze_binary called with: {binary_path}", file=sys.stderr, flush=True)
        binary_dir = os.path.dirname(binary_path)
        binary_name = os.path.basename(binary_path)
        output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
        os.makedirs(output_dir, exist_ok=True)
        output_json = os.path.join(output_dir, f"{binary_name}_functions.json")
        headless_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scripts', 'run_ghidra_headless.bat')
        print(f"[DEBUG] headless_script: {headless_script}", file=sys.stderr, flush=True)
        print(f"[DEBUG] output_json: {output_json}", file=sys.stderr, flush=True)
        print(f"[DEBUG] output_dir: {output_dir}", file=sys.stderr, flush=True)
        print(f"[DEBUG] Running: {headless_script} {binary_path}", file=sys.stderr, flush=True)

        print(json.dumps({"type": "progress", "progress": 10}))

        env = os.environ.copy()
        env['GHIDRA_OUTPUT_DIR'] = output_dir

        project_root = os.path.dirname(os.path.dirname(__file__))
        process = subprocess.Popen(
            [headless_script, "-binary", binary_path],
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
                print(json.dumps({"type": "progress", "progress": percent}))
                sys.stdout.flush()

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
                print(json.dumps({"type": "progress", "progress": percent}))
                sys.stdout.flush()

        process.wait()
        print(f"[DEBUG] Return code: {process.returncode}", file=sys.stderr, flush=True)
        # Read the rest of stdout and stderr for debugging
        if process.stdout:
            for line in process.stdout:
                print(f"[DEBUG] STDOUT: {line.strip()}", file=sys.stderr, flush=True)
        if process.stderr:
            for line in process.stderr:
                print(f"[DEBUG] STDERR: {line.strip()}", file=sys.stderr, flush=True)

        print(json.dumps({"type": "progress", "progress": 90}))

        if process.returncode != 0:
            print(json.dumps({
                "type": "error",
                "message": f"Analysis failed: see logs for details"
            }))
            return

        if not os.path.exists(output_json):
            print(json.dumps({
                "type": "error",
                "message": f"JSON output not found: {output_json}"
            }))
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

        print(json.dumps({
            "type": "analysis_complete",
            "data": result,
            "path": output_json,
            "filename": os.path.basename(output_json)
        }))

    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))

def analyze_json_with_xrefs(json_string):
    try:
        data = json.loads(json_string)
        xref_data = analyze_xrefs(None, data)
        if isinstance(data, list):
            result = {
                "functions": data,
                "cross_references": xref_data
            }
        else:
            data["cross_references"] = xref_data
            result = data
        print(json.dumps({
            "type": "analysis_complete",
            "data": result
        }))
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))

# Load OpenAI API key from environment variable
openai.api_key = os.getenv('OPENAI_API_KEY')

# Cache for storing chat responses
chat_cache = {}

def get_cache_key(message: str, context: Dict[str, Any]) -> str:
    """Generate a cache key based on message and context."""
    cache_data = {
        'message': message,
        'function_name': context.get('functionName'),
        'address': context.get('address'),
        'pseudocode_hash': hashlib.md5(context.get('pseudocode', '').encode()).hexdigest()
    }
    return hashlib.md5(json.dumps(cache_data, sort_keys=True).encode()).hexdigest()

# Chat session management
class ChatSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.messages = []
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self.name = None  # Add name field

    def add_message(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})
        self.last_activity = datetime.now()
        
        # Generate name after first user message if not set
        if role == "user" and not self.name and len(self.messages) == 1:
            self.generate_name(content)

    def get_messages(self) -> List[Dict[str, str]]:
        return self.messages

    def clear(self):
        self.messages = []
        self.last_activity = datetime.now()
        self.name = None  # Reset name when clearing

    def generate_name(self, first_message: str):
        """Generate a name for the chat based on the first user message."""
        try:
            # Truncate message if too long
            truncated_message = first_message[:100]
            
            # Create a prompt for name generation
            messages = [
                {"role": "system", "content": "Generate a short, descriptive title (max 5 words) for a chat based on the first message. The title should capture the main topic or question."},
                {"role": "user", "content": f"First message: {truncated_message}"}
            ]
            
            # Call OpenAI API to generate name
            client = openai.OpenAI()
            response = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=messages,
                max_tokens=20,
                temperature=0.7
            )
            
            # Extract and clean the generated name
            generated_name = response.choices[0].message.content.strip()
            # Remove quotes if present
            generated_name = generated_name.strip('"\'')
            # Truncate if too long
            self.name = generated_name[:50]
            
        except Exception as e:
            print(f"[Chat] Error generating chat name: {str(e)}", file=sys.stderr)
            # Fallback to a default name
            self.name = f"Chat {self.session_id[:8]}"

# Store active chat sessions
chat_sessions: Dict[str, ChatSession] = {}

# Cleanup old sessions (older than 24 hours)
def cleanup_old_sessions():
    now = datetime.now()
    sessions_to_remove = []
    for session_id, session in chat_sessions.items():
        if (now - session.last_activity) > timedelta(hours=24):
            sessions_to_remove.append(session_id)
    for session_id in sessions_to_remove:
        del chat_sessions[session_id]

async def stream_chat_response(message: str, context: Dict[str, Any], session_id: Optional[str] = None):
    """Stream chat responses from OpenAI API."""
    print(f"[Chat] Received message: {message}", file=sys.stderr)
    print(f"[Chat] Context: {json.dumps(context, indent=2)}", file=sys.stderr)
    
    # Check rate limits
    allowed, error_message = check_rate_limit()
    if not allowed:
        print(f"[Chat] Rate limit exceeded: {error_message}", file=sys.stderr)
        yield f"data: {json.dumps({'reply': f'Rate limit exceeded. Please try again later. {error_message}'})}\n\n"
        await asyncio.sleep(0)
        return

    # Create new session if none exists or if the provided session_id doesn't exist
    if not session_id or session_id not in chat_sessions:
        session_id = hashlib.md5(str(datetime.now()).encode()).hexdigest()
        chat_sessions[session_id] = ChatSession(session_id)
    
    session = chat_sessions[session_id]
    session.add_message("user", message)
    
    # Prepare the prompt with context and chat history
    system_prompt = """You are an AI assistant helping with reverse engineering. 
    You have access to the current function's context and previous conversation history.
    Please provide clear and concise responses focusing on the reverse engineering aspects."""

    # Build messages array with history
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add chat history
    for msg in session.get_messages():
        messages.append(msg)
    
    # Add current context
    context_prompt = f"""
Function Context:
- Name: {context.get('functionName')}
- Address: {context.get('address')}

Pseudocode Analysis:
{context.get('pseudocode')}
"""
    messages.append({"role": "system", "content": context_prompt})

    try:
        print("[Chat] Checking OpenAI API key...", file=sys.stderr)
        if not openai.api_key:
            raise ValueError("OpenAI API key not found in environment variables")
            
        print("[Chat] Calling OpenAI API...", file=sys.stderr)
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=messages,
            max_tokens=500,
            temperature=0.7,
            stream=True
        )
        
        full_reply = ""
        for chunk in response:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_reply += content
                yield f"data: {json.dumps({'reply': content, 'session_id': session_id})}\n\n"
                await asyncio.sleep(0)
        
        # Add assistant's response to chat history
        session.add_message("assistant", full_reply)
        
    except Exception as e:
        print(f"[Chat] Error: {str(e)}", file=sys.stderr)
        error_message = f"Error: {str(e)}"
        yield f"data: {json.dumps({'reply': error_message, 'session_id': session_id})}\n\n"
        await asyncio.sleep(0)

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        print(f"[Chat API] Received request: {request.message}", file=sys.stderr)
        return StreamingResponse(
            stream_chat_response(request.message, request.context, request.session_id),
            media_type="text/event-stream"
        )
    except Exception as e:
        print(f"[Chat API] Error handling request: {str(e)}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/new")
async def new_chat():
    """Create a new chat session."""
    # Don't create a session immediately, just return a temporary ID
    # The actual session will be created when the first message is sent
    temp_id = hashlib.md5(str(datetime.now()).encode()).hexdigest()
    return {"session_id": temp_id}

@app.post("/api/chat/{session_id}/clear")
async def clear_chat(session_id: str):
    """Clear a chat session's history."""
    if session_id in chat_sessions:
        chat_sessions[session_id].clear()
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Chat session not found")

@app.delete("/api/chat/{session_id}")
async def delete_chat(session_id: str):
    """Delete a chat session."""
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Chat session not found")

@app.get("/api/chat/sessions")
async def list_sessions():
    """List all active chat sessions."""
    cleanup_old_sessions()  # Clean up old sessions before listing
    return {
        "sessions": [
            {
                "session_id": session_id,
                "name": session.name or f"Chat {session_id[:8]}",  # Include name in response
                "created_at": session.created_at.isoformat(),
                "last_activity": session.last_activity.isoformat(),
                "message_count": len(session.messages),
                "messages": session.messages  # Include messages in response
            }
            for session_id, session in chat_sessions.items()
        ]
    }

def start_server():
    """Start the FastAPI server"""
    uvicorn.run(app, host="127.0.0.1", port=8000)

def main():
    # Check if we should start the server
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        print("[Server] Starting FastAPI server...", file=sys.stderr)
        start_server()
        return

    # Original message handling logic
    while True:
        try:
            message = input()
            data = json.loads(message)
            if data.get('type') == 'analyze_binary':
                analyze_binary(data['path'])
            elif data.get('type') == 'analyze_json':
                analyze_json_with_xrefs(data['json'])
        except EOFError:
            break
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "message": str(e)
            }))

if __name__ == '__main__':
    main() 