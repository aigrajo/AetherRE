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
import uvicorn
from pydantic import BaseModel

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

# Pydantic models for request/response
class ChatRequest(BaseModel):
    message: str
    context: Dict[str, Any]

class ChatResponse(BaseModel):
    reply: str

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

async def handle_chat_message(message: str, context: Dict[str, Any]) -> Dict[str, str]:
    """Handle chat messages with OpenAI API."""
    print(f"[Chat] Received message: {message}", file=sys.stderr)
    print(f"[Chat] Context: {json.dumps(context, indent=2)}", file=sys.stderr)
    
    cache_key = get_cache_key(message, context)
    print(f"[Chat] Cache key: {cache_key}", file=sys.stderr)
    
    # Check cache first
    if cache_key in chat_cache:
        print(f"[Chat] Cache hit for key: {cache_key}", file=sys.stderr)
        return {'reply': chat_cache[cache_key]}
    
    print("[Chat] Cache miss, calling OpenAI API", file=sys.stderr)
    
    # Prepare the prompt with context
    prompt = f"""You are an AI assistant helping with reverse engineering. 
Current function: {context.get('functionName')}
Address: {context.get('address')}

Pseudocode:
{context.get('pseudocode')}

User question: {message}

Please provide a clear and concise response focusing on the reverse engineering aspects."""

    try:
        print("[Chat] Checking OpenAI API key...", file=sys.stderr)
        if not openai.api_key:
            raise ValueError("OpenAI API key not found in environment variables")
            
        print("[Chat] Calling OpenAI API...", file=sys.stderr)
        # Call OpenAI API
        response = await openai.ChatCompletion.acreate(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert reverse engineering assistant. Provide clear, technical explanations focused on binary analysis and function behavior."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        reply = response.choices[0].message.content.strip()
        print(f"[Chat] Received response from OpenAI: {reply[:100]}...", file=sys.stderr)
        
        # Cache the response
        chat_cache[cache_key] = reply
        print(f"[Chat] Cached response for key: {cache_key}", file=sys.stderr)
        
        return {'reply': reply}
    except ValueError as ve:
        print(f"[Chat] Configuration error: {str(ve)}", file=sys.stderr)
        return {'reply': "Configuration error: OpenAI API key not found. Please check your environment variables."}
    except openai.error.AuthenticationError as ae:
        print(f"[Chat] Authentication error: {str(ae)}", file=sys.stderr)
        return {'reply': "Authentication error: Invalid OpenAI API key. Please check your credentials."}
    except openai.error.RateLimitError as re:
        print(f"[Chat] Rate limit error: {str(re)}", file=sys.stderr)
        return {'reply': "Rate limit exceeded. Please try again in a few moments."}
    except Exception as e:
        print(f"[Chat] Unexpected error: {str(e)}", file=sys.stderr)
        print(f"[Chat] Error type: {type(e)}", file=sys.stderr)
        import traceback
        print(f"[Chat] Traceback: {traceback.format_exc()}", file=sys.stderr)
        return {'reply': "I apologize, but I encountered an error processing your request. Please try again."}

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        print(f"[Chat API] Received request: {request.message}", file=sys.stderr)
        result = await handle_chat_message(request.message, request.context)
        return result
    except Exception as e:
        print(f"[Chat API] Error handling request: {str(e)}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))

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