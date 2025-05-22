#!/usr/bin/env python3
import sys
import json
import hashlib
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, AsyncGenerator
import openai

from backend.config.settings import OPENAI_API_KEY, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, SESSION_TIMEOUT_HOURS
from backend.config.rate_limits import check_rate_limit
from backend.utils.helpers import get_cache_key
from backend.services.notes_service import get_note, get_tags

# Set OpenAI API key
openai.api_key = OPENAI_API_KEY

# Cache for storing chat responses
chat_cache = {}

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
            
            # Get current function and context information
            function_name = getattr(self, 'function_name', 'Unknown Function')
            active_context = getattr(self, 'active_context', [])
            
            # Create a prompt for name generation
            messages = [
                {"role": "system", "content": "Generate a short, descriptive title (max 6 words) for a chat based on the first message, function being analyzed, and active context toggles. The title should capture the main topic or question."},
                {"role": "user", "content": f"First message: {truncated_message}\nFunction: {function_name}\nActive context: {', '.join(active_context)}"}
            ]
            
            # Call OpenAI API to generate name
            client = openai.OpenAI()
            response = client.chat.completions.create(
                model=DEFAULT_MODEL,
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
        if (now - session.last_activity) > timedelta(hours=SESSION_TIMEOUT_HOURS):
            sessions_to_remove.append(session_id)
    for session_id in sessions_to_remove:
        del chat_sessions[session_id]

async def stream_chat_response(message: str, context: Dict[str, Any], session_id: Optional[str] = None) -> AsyncGenerator[str, None]:
    """Stream chat responses from OpenAI API.
    
    Args:
        message: User message
        context: Context data for the function being analyzed
        session_id: Optional session ID for continuing conversations
        
    Yields:
        str: JSON-formatted event stream data
    """
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
    
    # Format assembly instructions
    assembly_text = ""
    if context.get('assembly'):
        assembly_text = "\nAssembly Instructions:\n"
        for instr in context['assembly']:
            assembly_text += f"{instr['address']}: {instr['mnemonic']} {instr['operands']}\n"

    # Format variables
    variables_text = ""
    if context.get('variables'):
        variables_text = "\nLocal Variables:\n"
        for var in context['variables']:
            variables_text += f"- {var['name']} ({var['type']}) at offset {var['offset']}\n"

    # Format xrefs
    xrefs_text = ""
    if context.get('xrefs'):
        xrefs = context['xrefs']
        if xrefs.get('incoming'):
            xrefs_text += "\nIncoming References:\n"
            for xref in xrefs['incoming']:
                xrefs_text += f"- {xref['name']} at {xref['address']} (offset: {xref['offset']})\n"
        if xrefs.get('outgoing'):
            xrefs_text += "\nOutgoing References:\n"
            for xref in xrefs['outgoing']:
                xrefs_text += f"- {xref['name']} at {xref['address']} (offset: {xref['offset']})\n"

    # Format strings
    strings_text = ""
    if context.get('strings'):
        strings_text = "\nString References:\n"
        for string in context['strings']:
            strings_text += f"- {string['value']} at {string['address']}\n"

    # Format CFG
    cfg_text = ""
    if context.get('cfg'):
        cfg = context['cfg']
        cfg_text = "\nControl Flow Graph:\n"
        for node in cfg['nodes']:
            cfg_text += f"\nNode at {node['address']}:\n"
            for instr in node['instructions']:
                cfg_text += f"  {instr['mnemonic']} {instr['operands']}\n"
        cfg_text += "\nEdges:\n"
        for edge in cfg['edges']:
            cfg_text += f"- {edge['source']} -> {edge['target']}\n"
    
    # Format notes if included in context
    notes_text = ""
    if context.get('notes'):
        notes_text = "\nAnalyst Notes:\n" + context['notes']
    
    # Format tags if included in context
    tags_text = ""
    if context.get('tags') and len(context['tags']) > 0:
        tags_text = "\nTags:\n"
        for tag in context['tags']:
            # Only use type and value fields
            tag_info = f"- {tag['value']} (Type: {tag['type']})"
            tags_text += tag_info + "\n"

    # Add current context
    context_prompt = f"""
Function Context:
- Name: {context.get('functionName')}
- Address: {context.get('address')}

Pseudocode Analysis:
{context.get('pseudocode')}
{assembly_text}
{variables_text}
{xrefs_text}
{strings_text}
{cfg_text}
{notes_text}
{tags_text}
"""
    messages.append({"role": "system", "content": context_prompt})

    try:
        print("[Chat] Checking OpenAI API key...", file=sys.stderr)
        if not openai.api_key:
            raise ValueError("OpenAI API key not found in environment variables")
            
        print("[Chat] Calling OpenAI API...", file=sys.stderr)
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
            max_tokens=DEFAULT_MAX_TOKENS,
            temperature=DEFAULT_TEMPERATURE,
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

# Functions for session management
def create_new_session() -> str:
    """Create a new chat session."""
    session_id = hashlib.md5(str(datetime.now()).encode()).hexdigest()
    return session_id

def clear_session(session_id: str) -> bool:
    """Clear a chat session's history."""
    if session_id in chat_sessions:
        chat_sessions[session_id].clear()
        return True
    return False

def delete_session(session_id: str) -> bool:
    """Delete a chat session."""
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        return True
    return False

def get_all_sessions() -> List[Dict[str, Any]]:
    """List all active chat sessions."""
    cleanup_old_sessions()  # Clean up old sessions before listing
    return [
        {
            "session_id": session_id,
            "name": session.name,  # Only use the generated name
            "created_at": session.created_at.isoformat(),
            "last_activity": session.last_activity.isoformat(),
            "message_count": len(session.messages),
            "messages": session.messages
        }
        for session_id, session in chat_sessions.items()
        if session_id is not None and len(session.messages) > 0 and session.name is not None
    ] 