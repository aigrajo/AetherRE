#!/usr/bin/env python3
import sys
import json
import hashlib
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, AsyncGenerator
import openai
import re

from backend.config.settings import OPENAI_API_KEY, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, SESSION_TIMEOUT_HOURS
from backend.config.rate_limits import check_rate_limit
from backend.utils.helpers import get_cache_key
from backend.services.function_context import function_context_service
from backend.services.session_manager import session_manager
from backend.services.ai_tools_service import ai_tools_service
from backend.services.note_integration_service import note_integration_service

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
        
        # Note: Session naming is now handled in stream_chat_response after context is available

    def get_messages(self) -> List[Dict[str, str]]:
        return self.messages

    def clear(self):
        self.messages = []
        self.last_activity = datetime.now()
        self.name = None  # Reset name when clearing

    def generate_name(self, first_message: str):
        """Generate a name for the session based on the first message."""
        # Simple name generation based on first few words as fallback
        words = first_message.split()[:3]
        if words:
            self.name = ' '.join(words).title()
            if len(self.name) > 30:
                self.name = self.name[:27] + "..."
        else:
            self.name = f"Chat {self.session_id[:8]}"
    
    def generate_name_with_context(self, first_message: str, function_context: Optional[Dict[str, Any]] = None):
        """Generate a name for the session with function context."""
        if function_context:
            function_name = function_context.get('functionName', '')
            address = function_context.get('address', '')
            
            # Extract key words from user message
            message_words = first_message.split()[:2]  # Take first 2 words from message
            
            # Build name with function context
            name_parts = []
            
            # Add function name if it's meaningful (not default naming)
            if function_name and function_name not in ['Unknown Function', ''] and not function_name.startswith('FUN_') and not function_name.startswith('SUB_'):
                name_parts.append(function_name)
            elif address and address not in ['0x0', '']:
                # Use address if function name is not meaningful
                name_parts.append(address)
            
            # Add message context
            if message_words:
                name_parts.extend(message_words)
            
            if name_parts:
                self.name = ' '.join(name_parts[:6])  # Max 6 words
                if len(self.name) > 50:
                    self.name = self.name[:47] + "..."
            else:
                self.generate_name(first_message)  # Fallback to simple naming
        else:
            self.generate_name(first_message)  # Fallback to simple naming
    
    async def generate_name_async(self, first_message: str, function_context: Optional[Dict[str, Any]] = None):
        """Generate a name for the session using OpenAI with function context."""
        try:
            if not openai.api_key:
                self.generate_name_with_context(first_message, function_context)  # Fallback to simple naming
                return
            
            # Build context information for the prompt
            context_info = ""
            if function_context:
                function_name = function_context.get('functionName', '')
                address = function_context.get('address', '')
                binary_name = function_context.get('binaryName', '')
                
                if function_name and function_name not in ['Unknown Function', '']:
                    context_info += f"Function: {function_name}"
                if address and address not in ['0x0', '']:
                    if context_info:
                        context_info += f" at {address}"
                    else:
                        context_info += f"Address: {address}"
                if binary_name:
                    if context_info:
                        context_info += f" in {binary_name}"
                    else:
                        context_info += f"Binary: {binary_name}"
            
            # Create the prompt
            system_prompt = "Generate a short, descriptive title (6 words max) for a reverse engineering chat session. "
            system_prompt += "Focus on the function being analyzed and the user's intent. "
            system_prompt += "Return only the title, no quotes or extra text."
            
            user_prompt = f"User message: {first_message}"
            if context_info:
                user_prompt += f"\nContext: {context_info}"
            
            client = openai.OpenAI()
            response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=30,
                temperature=0.3
            )
            
            generated_name = response.choices[0].message.content.strip()
            # Remove quotes if present
            generated_name = generated_name.strip('"\'')
            
            if generated_name and len(generated_name) <= 60:
                self.name = generated_name
                print(f"[Chat] Generated session name: '{generated_name}'", file=sys.stderr)
            else:
                self.generate_name_with_context(first_message, function_context)  # Fallback
            
        except Exception as e:
            print(f"[Chat] Error generating session name: {str(e)}", file=sys.stderr)
            self.generate_name_with_context(first_message, function_context)  # Fallback to simple naming

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
        session_manager.clear_session_associations(session_id)

async def stream_chat_response(message: str, session_id: Optional[str] = None, 
                             toggle_states: Dict[str, bool] = None,
                             dynamic_content: Optional[Dict[str, Any]] = None,
                             function_id: Optional[str] = None,
                             use_ai_tools: bool = False) -> AsyncGenerator[str, None]:
    """Stream chat responses from OpenAI API with optional AI tool calling support.
    
    Args:
        message: User message
        session_id: Optional session ID for continuing conversations
        toggle_states: Dictionary of what context to include (manual mode)
        dynamic_content: Dynamic content like current pseudocode (manual mode)
        function_id: Function to associate with session
        use_ai_tools: Whether to use AI interaction engine (True) or manual context (False)
        
    Yields:
        str: JSON-formatted event stream data
    """
    print(f"[Chat] Received message: {message}", file=sys.stderr)
    print(f"[Chat] Use AI tools: {use_ai_tools}", file=sys.stderr)
    if not use_ai_tools:
        print(f"[Chat] Toggle states: {toggle_states}", file=sys.stderr)
    
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
        session_manager.set_current_session(session_id)
    
    # Associate session with function if provided
    if function_id:
        session_manager.associate_session_with_function(session_id, function_id)
        # Also associate in function context service for manual mode
        function_context_service.set_session_function(session_id, function_id)
    
    # Set session in AI tools service for tool execution
    if use_ai_tools:
        ai_tools_service.set_session(session_id)
    
    session = chat_sessions[session_id]
    session.add_message("user", message)
    
    # Build context based on mode
    context_data = ""
    if not use_ai_tools:
        # Manual context mode - use the existing context service method
        toggle_states = toggle_states or {}
        context_data = function_context_service.get_context_for_session(
            session_id=session_id,
            toggle_states=toggle_states,
            dynamic_content=dynamic_content
        )
        # Convert context dict to string for system message
        if context_data:
            context_parts = []
            if 'functionName' in context_data:
                context_parts.append(f"Function: {context_data['functionName']}")
            if 'address' in context_data:
                context_parts.append(f"Address: {context_data['address']}")
            if 'binaryName' in context_data:
                context_parts.append(f"Binary: {context_data['binaryName']}")
            
            if 'pseudocode' in context_data:
                context_parts.append(f"\nPseudocode:\n{context_data['pseudocode']}")
            
            if 'assembly' in context_data and context_data['assembly']:
                context_parts.append(f"\nAssembly ({len(context_data['assembly'])} instructions):")
                for instr in context_data['assembly'][:10]:  # Limit to first 10
                    addr = instr.get('address', '')
                    mnemonic = instr.get('mnemonic', '')
                    operands = instr.get('operands', '')
                    context_parts.append(f"  {addr}: {mnemonic} {operands}")
                if len(context_data['assembly']) > 10:
                    context_parts.append(f"  ... and {len(context_data['assembly']) - 10} more instructions")
            
            if 'variables' in context_data and context_data['variables']:
                context_parts.append(f"\nVariables ({len(context_data['variables'])}):")
                for var in context_data['variables'][:5]:  # Limit to first 5
                    name = var.get('name', '')
                    var_type = var.get('type', '')
                    context_parts.append(f"  {name} ({var_type})")
                if len(context_data['variables']) > 5:
                    context_parts.append(f"  ... and {len(context_data['variables']) - 5} more variables")
            
            if 'strings' in context_data and context_data['strings']:
                context_parts.append(f"\nStrings ({len(context_data['strings'])}):")
                for string in context_data['strings'][:5]:  # Limit to first 5
                    value = string.get('value', '')
                    context_parts.append(f"  \"{value}\"")
                if len(context_data['strings']) > 5:
                    context_parts.append(f"  ... and {len(context_data['strings']) - 5} more strings")
            
            if 'xrefs' in context_data and context_data['xrefs']:
                incoming = context_data['xrefs'].get('incoming', [])
                outgoing = context_data['xrefs'].get('outgoing', [])
                if incoming or outgoing:
                    context_parts.append(f"\nCross-references:")
                    context_parts.append(f"  Incoming: {len(incoming)} references")
                    context_parts.append(f"  Outgoing: {len(outgoing)} references")
            
            if 'notes' in context_data:
                context_parts.append(f"\nNotes:\n{context_data['notes']}")
            
            if 'tags' in context_data and context_data['tags']:
                context_parts.append(f"\nTags: {', '.join(context_data['tags'])}")
            
            context_data = "\n".join(context_parts)
        else:
            context_data = ""
    
    # Generate session name if this is the first user message and no name is set
    if not session.name and len(session.messages) == 1:
        try:
            # Get function context for naming
            function_context = None
            if not use_ai_tools:
                # Manual mode - get context dict from function context service
                function_context = function_context_service.get_context_for_session(
                    session_id=session_id,
                    toggle_states=toggle_states or {},
                    dynamic_content=dynamic_content
                )
            elif use_ai_tools and function_id:
                # AI tools mode - get context from function_id
                function_context = function_context_service.get_function_context(function_id)
            
            # Generate name asynchronously with context
            await session.generate_name_async(message, function_context)
            print(f"[Chat] Session named: '{session.name}'", file=sys.stderr)
        except Exception as e:
            print(f"[Chat] Error generating session name: {str(e)}", file=sys.stderr)
            # Fallback to simple naming
            session.generate_name(message)
    
    # Build messages for OpenAI
    messages = []
    
    # System message based on mode
    if use_ai_tools:
        # AI interaction mode 
        system_message = "You are an AI assistant specialized in reverse engineering and binary analysis. "
        system_message += "You work iteratively like Cursor IDE - each tool call should lead to the next logical step.\n\n"
        system_message += "CRITICAL: You MUST use tools to analyze functions. Do NOT just describe what you will do - actually call the tools.\n"
        system_message += "Give a VERY BRIEF initial response (1-2 sentences max), then IMMEDIATELY call the appropriate tools.\n\n"
        system_message += "CRITICAL WORKFLOW RULES:\n"
        system_message += "1. After jump_to_function: IMMEDIATELY call get_pseudocode to see the new function's code\n"
        system_message += "2. After get_pseudocode: Analyze the code and identify interesting elements (function calls, strings, conditions)\n"
        system_message += "3. After search_functions: If you find a function, jump to it with jump_to_function\n"
        system_message += "4. Keep initial responses brief - detailed analysis happens in thinking phase\n"
        system_message += "5. Each tool call should build on the previous results\n\n"
        system_message += "Available tools:\n"
        system_message += "- get_pseudocode: Get decompiled code for CURRENT function\n"
        system_message += "- get_assembly: Get assembly for CURRENT function\n"
        system_message += "- get_variables: Get variables for CURRENT function\n"
        system_message += "- get_xrefs: Get cross-references for CURRENT function\n"
        system_message += "- get_strings: Get strings for CURRENT function\n"
        system_message += "- search_functions: Search for functions by name across entire binary\n"
        system_message += "- jump_to_function: Switch to analyze a different function (use address or name)\n\n"
        system_message += "REMEMBER: After jump_to_function, the 'current function' changes, so get_pseudocode will show the NEW function's code."
        
        # Add function context if available for tool usage
        if function_id:
            system_message += f"\n\nStarting analysis on function ID {function_id}."
    else:
        # Manual context mode - traditional chat with provided context
        system_message = "You are an AI assistant specialized in reverse engineering and binary analysis. "
        system_message += "Help the user understand and analyze the provided function context. "
        system_message += "Provide detailed explanations, identify patterns, suggest improvements, and answer questions about the code."
        
        if context_data:
            system_message += f"\n\nCurrent context:\n{context_data}"
    
    messages.append({"role": "system", "content": system_message})
    
    # Add conversation history
    messages.extend(session.get_messages())

    try:
        print("[Chat] Checking OpenAI API key...", file=sys.stderr)
        if not openai.api_key:
            error_msg = "OpenAI API key not configured. Please set your API key in the backend configuration."
            yield f"data: {json.dumps({'reply': error_msg, 'session_id': session_id, 'error_type': 'configuration_error'})}\n\n"
            await asyncio.sleep(0)
            return
            
        print("[Chat] Calling OpenAI API...", file=sys.stderr)
        
        client = openai.OpenAI()
        
        # Get available tools for function calling (only in AI mode)
        tools = None
        tool_choice = None
        max_tokens = DEFAULT_MAX_TOKENS
        
        if use_ai_tools:
            tools = ai_tools_service.get_openai_functions()
            # Force tool usage for analysis questions
            analysis_keywords = ['analyze', 'what does', 'how does', 'explain', 'understand', 'purpose', 'function']
            requires_analysis = any(keyword in message.lower() for keyword in analysis_keywords)
            tool_choice = "required" if tools and requires_analysis else ("auto" if tools else None)
            max_tokens = int(DEFAULT_MAX_TOKENS * 2)  # 2x token limit for auto context mode
            print(f"[Chat] Auto context mode - {len(tools) if tools else 0} tools available, max_tokens: {max_tokens}", file=sys.stderr)
            
            # Debug: Log system message and user message for AI mode
            print(f"[Chat] SYSTEM MESSAGE DEBUG:", file=sys.stderr)
            print(f"[Chat] System message length: {len(system_message)} chars", file=sys.stderr)
            print(f"[Chat] User message: {message}", file=sys.stderr)
            print(f"[Chat] Available tools: {[tool['name'] for tool in tools] if tools else 'None'}", file=sys.stderr)
            
            # Initialize variables
            full_reply = ""
            tool_calls = []
            
            # STEP 0: Generate initial plan/response based on user prompt
            initial_messages = messages + [{
                "role": "user",
                "content": f"Based on the user's request: '{message}', provide a brief 1-2 sentence response explaining what you plan to do. Be specific about your approach but keep it concise."
            }]
            
            initial_response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=initial_messages,
                max_tokens=100,  # Keep initial response brief
                temperature=DEFAULT_TEMPERATURE,
                tools=None,  # No tools for initial response
                stream=True
            )
            
            initial_content = ""
            for chunk in initial_response:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    initial_content += content
                    full_reply += content
                    yield f"data: {json.dumps({'reply': content, 'session_id': session_id})}\n\n"
                    await asyncio.sleep(0)
            
            # Add initial response to conversation
            if initial_content:
                messages.append({"role": "assistant", "content": initial_content})
            
            # STEP 1: Get reasoning without tools (forces text output)
            reasoning_response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=DEFAULT_TEMPERATURE,
                tools=None,  # No tools = forces reasoning text
                stream=True
            )
            
            tool_content = ""
            for chunk in reasoning_response:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    tool_content += content
                    full_reply += content
                    if content.strip():
                        print(f"[THOUGHT-PROCESS] {content.strip()}", file=sys.stderr)
                        yield f"data: {json.dumps({'reply': content, 'session_id': session_id, 'type': 'thinking'})}\n\n"
                        await asyncio.sleep(0)
            
            # Add reasoning to conversation
            if tool_content:
                messages.append({"role": "assistant", "content": tool_content})
            
            # STEP 2: Get tool calls with tools required
            messages.append({
                "role": "user",
                "content": "Based on your analysis above and the tool results in our conversation, now call the appropriate tool(s) to continue the investigation."
            })
            
            tool_response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=DEFAULT_TEMPERATURE,
                tools=[{"type": "function", "function": tool} for tool in tools] if tools else None,
                tool_choice="required" if tools else None,
                stream=True
            )
            
            new_tool_calls = []  # will hold assembled tool calls by index
            
            for chunk in tool_response:
                delta = chunk.choices[0].delta
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.index is None:
                            continue
                        # Ensure list size
                        while len(new_tool_calls) <= tc.index:
                            new_tool_calls.append({"id": "", "function": {"name": "", "arguments": ""}})
                        tgt = new_tool_calls[tc.index]
                        if tc.id:
                            tgt["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tgt["function"]["name"] = tc.function.name
                            if tc.function.arguments:
                                tgt["function"]["arguments"] += tc.function.arguments
            
            # Queue the tool calls
            for call in new_tool_calls:
                if call["function"]["name"]:
                    tool_calls.append(call)
        else:
            max_tokens = int(DEFAULT_MAX_TOKENS * 1.5)  # 1.5x token limit for manual context mode
            print(f"[Chat] Manual mode - no tools enabled, max_tokens: {max_tokens}", file=sys.stderr)
            
            # Initialize variables for manual mode
            full_reply = ""
            tool_calls = []
            
            # Manual mode - make regular API call
            response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=DEFAULT_TEMPERATURE,
                stream=True
            )
            
            for chunk in response:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    full_reply += content
                    yield f"data: {json.dumps({'reply': content, 'session_id': session_id})}\n\n"
                    await asyncio.sleep(0)
        
        # Debug: Log AI's initial response and tool determination
        if use_ai_tools:
            print(f"[Chat] AI WORKFLOW DEBUG:", file=sys.stderr)
            print(f"[Chat] Initial AI response: {full_reply[:200]}{'...' if len(full_reply) > 200 else ''}", file=sys.stderr)
            print(f"[Chat] Tool calls determined: {len(tool_calls)}", file=sys.stderr)
            for i, tool_call in enumerate(tool_calls):
                tool_name = tool_call["function"]["name"]
                try:
                    tool_args = json.loads(tool_call["function"]["arguments"])
                except json.JSONDecodeError:
                    tool_args = {}
                print(f"[Chat] Tool {i+1}: {tool_name} with args: {tool_args}", file=sys.stderr)
        
        # If we're in AI mode and have tool calls, execute Cursor-style iterative workflow
        if use_ai_tools and tool_calls:
            print(f"[Chat] Starting iterative workflow with {len(tool_calls)} initial tool calls", file=sys.stderr)
            
            max_iterations = 5
            current_iteration = 0
            total_tool_calls_executed = 0  # Count every executed tool call for reporting
            
            # First, let the AI explain its plan and execute initial tools
            while tool_calls and current_iteration < max_iterations:
                current_iteration += 1
                print(f"[Chat] Iteration {current_iteration}/{max_iterations}", file=sys.stderr)
                
                # Pop the first tool call to process individually
                tool_call = tool_calls.pop(0)
                tool_name = tool_call["function"]["name"]
                try:
                    tool_args = json.loads(tool_call["function"]["arguments"])
                except json.JSONDecodeError as e:
                    print(f"[Chat] JSON decode error for {tool_name}: {e}", file=sys.stderr)
                    print(f"[Chat] Raw arguments: {tool_call['function']['arguments']}", file=sys.stderr)
                    tool_args = {}
                
                print(f"[Chat] Executing tool: {tool_name} with args: {tool_args}", file=sys.stderr)
                
                # Show tool execution in Cursor style
                if tool_args:
                    tool_msg = f"Calling {tool_name}({', '.join(f'{k}={v}' for k, v in tool_args.items())})"
                else:
                    tool_msg = f"Calling {tool_name}()"
                yield f"data: {json.dumps({'reply': tool_msg, 'session_id': session_id, 'type': 'tool_call'})}\n\n"
                await asyncio.sleep(0)
                
                # Execute the tool
                tool_result = await ai_tools_service.execute_tool(tool_name, tool_args)
                
                if tool_result["success"]:
                    # Add tool result to conversation
                    messages.append({
                        "role": "function",
                        "name": tool_name,
                        "content": tool_result["result"]
                    })
                else:
                    # Add error result to conversation
                    error_msg = f"Error in {tool_name}: {tool_result.get('error', 'Unknown error')}"
                    messages.append({
                        "role": "function",
                        "name": tool_name,
                        "content": error_msg
                    })
                
                await asyncio.sleep(0)
                total_tool_calls_executed += 1
                
                # Ask the AI what to do next and stream its reasoning (thought process)
                tool_prompt = (
                    "Analyze the most recent tool result above and decide the NEXT step.\n"
                    "GUIDELINES (depth-1 exploration):\n"
                    "1. If the last executed tool was get_pseudocode, pick EACH non-library function that is called inside that pseudocode (use a maximum of three to avoid bloat).\n"
                    "   For every such callee you must immediately issue in this order:\n"
                    "      a) jump_to_function(<callee_addr_or_name>)\n"
                    "      b) get_pseudocode()\n"
                    "2. Do NOT recurse further than that — after analysing a callee once, you may inspect its xrefs/strings/variables but MUST NOT follow its own callees.\n"
                    "3. After get_pseudocode you may optionally call get_xrefs, get_strings or get_variables to enrich the analysis.\n"
                    "4. Stop issuing tool calls only when all direct callees of the ORIGINAL function have been analysed.\n"
                    "\nFirst, provide your step-by-step reasoning about what you learned from the tool result and what to investigate next. "
                    "Explain your thought process clearly for the user to follow your analysis."
                )
                
                messages.append({
                    "role": "user",
                    "content": tool_prompt
                })
                
                # STEP 1: Get reasoning without tools (forces text output)
                reasoning_response = client.chat.completions.create(
                    model=DEFAULT_MODEL,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=DEFAULT_TEMPERATURE,
                    tools=None,  # No tools = forces reasoning text
                    stream=True
                )
                
                tool_content = ""
                for chunk in reasoning_response:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        content = delta.content
                        tool_content += content
                        if content.strip():
                            print(f"[THOUGHT-PROCESS] {content.strip()}", file=sys.stderr)
                            yield f"data: {json.dumps({'reply': content, 'session_id': session_id, 'type': 'thinking'})}\n\n"
                            await asyncio.sleep(0)
                
                # Add reasoning to conversation
                if tool_content:
                    messages.append({"role": "assistant", "content": tool_content})
                
                # STEP 2: Get tool calls with tools required
                messages.append({
                    "role": "user",
                    "content": "Based on your analysis above and the tool results in our conversation, now call the appropriate tool(s) to continue the investigation."
                })
                
                tool_response = client.chat.completions.create(
                    model=DEFAULT_MODEL,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=DEFAULT_TEMPERATURE,
                    tools=[{"type": "function", "function": tool} for tool in tools] if tools else None,
                    tool_choice="required" if tools else None,
                    stream=True
                )
                
                new_tool_calls = []  # will hold assembled tool calls by index
                
                for chunk in tool_response:
                    delta = chunk.choices[0].delta
                    if delta.tool_calls:
                        for tc in delta.tool_calls:
                            if tc.index is None:
                                continue
                            # Ensure list size
                            while len(new_tool_calls) <= tc.index:
                                new_tool_calls.append({"id": "", "function": {"name": "", "arguments": ""}})
                            tgt = new_tool_calls[tc.index]
                            if tc.id:
                                tgt["id"] = tc.id
                            if tc.function:
                                if tc.function.name:
                                    tgt["function"]["name"] = tc.function.name
                                if tc.function.arguments:
                                    tgt["function"]["arguments"] += tc.function.arguments
                
                # Keep the thinking message visible until the next tool_call (the
                # frontend will clear it automatically on that event).  Do NOT
                # clear it here so the user can read the streamed rationale.
                
                # Queue the next tool call if provided by AI
                # filter out calls without a function name
                for call in new_tool_calls:
                    if call["function"]["name"]:
                        tool_calls.append(call)
                
                # Loop continues with next tool_call (if any)
            
            # Clear any remaining thinking content before final summary
            yield f"data: {json.dumps({'type': 'remove_thinking', 'session_id': session_id})}\n\n"
            await asyncio.sleep(0)
            
            # Start final summary
            summary_prompt = f"Based on all the analysis and tool results above, provide a comprehensive technical report that directly answers the user's question: '{message}'\n\n"
            summary_prompt += f"Guidelines for your report:\n\n"
            summary_prompt += f"1. **Direct Answer**: Start by directly addressing what the user asked for\n"
            summary_prompt += f"2. **Evidence-Based**: Support every claim with specific evidence from the tool results\n"
            summary_prompt += f"3. **Technical Detail**: Include relevant code snippets, function calls, addresses, and variable names\n"
            summary_prompt += f"4. **Structured Analysis**: Organize your findings logically with clear sections\n"
            summary_prompt += f"5. **Comprehensive Coverage**: Address all aspects relevant to the user's question\n\n"
            summary_prompt += f"Depending on the user's question, consider including:\n"
            summary_prompt += f"- Function behavior and execution flow (with pseudocode evidence)\n"
            summary_prompt += f"- Security vulnerabilities and risks (with specific code patterns)\n"
            summary_prompt += f"- Function dependencies and call relationships\n"
            summary_prompt += f"- Variable usage and data flow\n"
            summary_prompt += f"- Implementation details and notable patterns\n"
            summary_prompt += f"- Cross-references and relationships to other functions\n"
            summary_prompt += f"- Assembly-level details if relevant\n\n"
            summary_prompt += f"**Critical**: Every finding must be backed by concrete evidence from the pseudocode, assembly, variables, strings, or cross-references. "
            summary_prompt += f"Quote specific code, cite function names, reference addresses, and provide detailed technical justification. "
            summary_prompt += f"Make this a thorough analysis that serves as authoritative documentation for the user's specific inquiry."
            
            messages.append({
                "role": "user", 
                "content": summary_prompt
            })
            
            # Get final summary
            summary_response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=DEFAULT_TEMPERATURE,
                stream=True
            )
            
            summary_content = ""
            for chunk in summary_response:
                delta = chunk.choices[0].delta
                if delta.content:
                    content = delta.content
                    summary_content += content
                    full_reply += content
                    yield f"data: {json.dumps({'reply': content, 'session_id': session_id})}\n\n"
                    await asyncio.sleep(0)
            
            # Add summary to conversation
            if summary_content:
                messages.append({
                    "role": "assistant",
                    "content": summary_content
                })
            
            # Final summary if we hit the limit
            if total_tool_calls_executed:
                limit_msg = f"\n\n*Analysis completed after {total_tool_calls_executed} tool calls.*"
                full_reply += limit_msg
                yield f"data: {json.dumps({'reply': limit_msg, 'session_id': session_id})}\n\n"
                await asyncio.sleep(0)
        
        elif use_ai_tools and not tool_calls:
            # Try to parse tool calls from the text response as fallback
            tool_pattern = r'(?:calling|call)\s+(\w+)(?:\(([^)]*)\))?'
            text_tool_matches = re.findall(tool_pattern, full_reply.lower())
            
            if text_tool_matches:
                print(f"[Chat] Found {len(text_tool_matches)} tool calls in text, executing manually", file=sys.stderr)
                manual_tool_calls = []
                for tool_name, args_str in text_tool_matches:
                    if tool_name in ['get_pseudocode', 'get_assembly', 'get_variables', 'get_xrefs', 'get_strings', 'search_functions', 'jump_to_function']:
                        manual_tool_calls.append({
                            'function': {'name': tool_name, 'arguments': '{}'}
                        })
                
                if manual_tool_calls:
                    # Execute the manually parsed tool calls
                    tool_calls = manual_tool_calls
                    # Jump back into the iterative workflow
                    print(f"[Chat] Executing {len(tool_calls)} manually parsed tool calls", file=sys.stderr)
                else:
                    print("[Chat] No valid tool names found in text", file=sys.stderr)
            
            if not tool_calls:
                # Extra debug logging to understand why no tool calls were returned
                print("[Chat] WARNING: AI returned no tool calls in AI tools mode. Full assistant reply:", file=sys.stderr)
                print(full_reply[:1000] + ("..." if len(full_reply) > 1000 else ""), file=sys.stderr)
        
        elif not use_ai_tools:
            # Manual mode - just provide the response as-is
            if not full_reply:
                fallback_msg = "I understand you want to analyze this function. Please provide more specific details about what you'd like me to examine."
                full_reply = fallback_msg
                yield f"data: {json.dumps({'reply': fallback_msg, 'session_id': session_id})}\n\n"
                await asyncio.sleep(0)
        
        # Add assistant's response to chat history
        session.add_message("assistant", full_reply)
        
        # Generate session name if this is the first message
        if len(session.messages) == 2 and not session.name:  # user + assistant message
            await session.generate_name_async(message)
        
    except Exception as e:
        print(f"[Chat] Error: {str(e)}", file=sys.stderr)
        error_message = f"Error: {str(e)}"
        yield f"data: {json.dumps({'reply': error_message, 'session_id': session_id, 'error_type': 'api_error'})}\n\n"
        await asyncio.sleep(0)

# Session management functions
def create_new_session() -> str:
    """Create a new chat session."""
    session_id = hashlib.md5(str(datetime.now()).encode()).hexdigest()
    chat_sessions[session_id] = ChatSession(session_id)
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