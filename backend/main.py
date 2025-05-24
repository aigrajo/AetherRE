#!/usr/bin/env python3
import sys
import json
import os
import uvicorn
import asyncio
from fastapi import FastAPI

# Fix import path to include the project root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import configuration
from backend.config.settings import API_HOST, API_PORT, CORS_MIDDLEWARE_SETTINGS

# Import API routes
from backend.api.routes.chat import router as chat_router
from backend.api.routes.notes import router as notes_router
from backend.api.routes.validation import router as validation_router
from backend.api.routes.projects import router as projects_router
from backend.api.routes.tags import router as tags_router
from backend.api.routes.files import router as files_router

# Import utilities
from backend.utils.helpers import analyze_xrefs, process_function_data_with_enhancements

# Initialize FastAPI app
app = FastAPI(title="AetherRE Backend API")

# Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    **CORS_MIDDLEWARE_SETTINGS
)

# Register routers
app.include_router(chat_router)
app.include_router(notes_router, prefix="/api")
app.include_router(validation_router)
app.include_router(projects_router)
app.include_router(tags_router)
app.include_router(files_router)

# Command-line mode functions
def analyze_binary(binary_path: str):
    """Analyze a binary file from the command line."""
    from backend.api.routes.chat import analyze_binary as api_analyze_binary
    
    async def process_results():
        try:
            # Call the API function and await the response
            response = await api_analyze_binary(binary_path)
            
            # Iterate over the streaming response
            async for chunk in response.body_iterator:
                if chunk:
                    # Convert bytes to string if needed
                    if isinstance(chunk, bytes):
                        chunk = chunk.decode('utf-8')
                    print(chunk, end='')
                    sys.stdout.flush()
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "message": str(e)
            }))
    
    # Use the new asyncio.run() instead of get_event_loop()
    asyncio.run(process_results())

def analyze_json_with_xrefs(json_string: str):
    """Analyze JSON data with cross-reference information."""
    try:
        data = json.loads(json_string)
        
        # Import the enhanced processing function
        try:
            from backend.utils.helpers import analyze_xrefs, process_function_data_with_enhancements
            
            # Process CFG layouts and other enhancements
            enhanced_data = process_function_data_with_enhancements(data)
            
            # Compute cross-references
            xref_data = analyze_xrefs(None, enhanced_data)
        except ImportError as import_err:
            print(f"[DEBUG] Failed to import enhanced processing: {import_err}", file=sys.stderr)
            # Fallback to basic xref processing
            from backend.utils.helpers import analyze_xrefs
            enhanced_data = data
            xref_data = analyze_xrefs(None, enhanced_data)
        
        if isinstance(enhanced_data, list):
            result = {
                "functions": enhanced_data,
                "cross_references": xref_data
            }
        else:
            enhanced_data["cross_references"] = xref_data
            result = enhanced_data
            
        print(json.dumps({
            "type": "analysis_complete",
            "data": result
        }))
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))

def start_server():
    """Start the FastAPI server"""
    uvicorn.run(app, host=API_HOST, port=API_PORT)

def main():
    # Check if we should start the server
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        print("[Server] Starting FastAPI server...", file=sys.stderr)
        start_server()
        return

    # Original message handling logic for command-line mode
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