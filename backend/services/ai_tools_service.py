#!/usr/bin/env python3
"""
AI Tools Service for AetherRE AI Interaction Engine
Provides individual context tools for iterative analysis workflows
"""

import sys
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable, Union
from abc import ABC, abstractmethod
from datetime import datetime

from backend.services.function_context import function_context_service

class AITool:
    """Represents an AI tool that can be called by the AI assistant"""
    def __init__(self, name: str, description: str, parameters: Dict[str, Any], 
                 handler: Callable):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.handler = handler
    
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute the tool with given parameters"""
        try:
            result = await self.handler(**kwargs)
            return {
                "success": True,
                "result": result,
                "tool": self.name,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            print(f"[AITools] Error executing tool {self.name}: {str(e)}", file=sys.stderr)
            return {
                "success": False,
                "error": str(e),
                "tool": self.name,
                "timestamp": datetime.now().isoformat()
            }
    
    def to_openai_function(self) -> Dict[str, Any]:
        """Convert tool to OpenAI function calling format"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters
        }

class AIToolsService:
    """Service for managing and executing AI tools"""
    
    def __init__(self):
        self.tools: Dict[str, AITool] = {}
        self.current_session_id: Optional[str] = None
        self.current_binary_name: Optional[str] = None
        self.binary_functions_cache: Dict[str, List[Dict[str, Any]]] = {}  # binary_name -> functions list
        self._register_re_tools()
    
    def set_session(self, session_id: str):
        """Set the current session for tool execution"""
        self.current_session_id = session_id
        
        # Get the binary name from the current session's function
        if session_id in function_context_service.session_context_states:
            function_id = function_context_service.session_context_states[session_id]
            if function_id in function_context_service.current_function_data:
                function_data = function_context_service.current_function_data[function_id]
                self.current_binary_name = function_data.get('binary_name')
                print(f"[AITools] Set binary context: {self.current_binary_name}", file=sys.stderr)
                
                # Load binary functions data if not cached
                if self.current_binary_name and self.current_binary_name not in self.binary_functions_cache:
                    self._load_binary_functions_data(self.current_binary_name)
    
    def _load_binary_functions_data(self, binary_name: str):
        """Load all functions data for a binary from the data directory"""
        try:
            data_dir = Path("data")
            functions_file = data_dir / f"{binary_name}_functions.json"
            
            if functions_file.exists():
                with open(functions_file, 'r', encoding='utf-8') as f:
                    functions_data = json.load(f)
                    
                # Handle both array format and object format
                if isinstance(functions_data, list):
                    # Direct array of functions
                    self.binary_functions_cache[binary_name] = functions_data
                    print(f"[AITools] Loaded {len(functions_data)} functions for binary {binary_name}", file=sys.stderr)
                elif isinstance(functions_data, dict) and 'functions' in functions_data:
                    # Object with functions key
                    self.binary_functions_cache[binary_name] = functions_data['functions']
                    print(f"[AITools] Loaded {len(functions_data['functions'])} functions for binary {binary_name}", file=sys.stderr)
                else:
                    print(f"[AITools] Unexpected JSON structure in {functions_file}", file=sys.stderr)
                    self.binary_functions_cache[binary_name] = []
            else:
                print(f"[AITools] Functions file not found: {functions_file}", file=sys.stderr)
                self.binary_functions_cache[binary_name] = []
                
        except Exception as e:
            print(f"[AITools] Error loading binary functions data: {e}", file=sys.stderr)
            self.binary_functions_cache[binary_name] = []
    
    def get_binary_functions(self, binary_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all functions for a binary"""
        binary_name = binary_name or self.current_binary_name
        if not binary_name:
            return []
            
        if binary_name not in self.binary_functions_cache:
            self._load_binary_functions_data(binary_name)
            
        return self.binary_functions_cache.get(binary_name, [])
    
    def register_tool(self, tool: AITool) -> None:
        """Register a new tool"""
        self.tools[tool.name] = tool
        print(f"[AITools] Registered tool: {tool.name}", file=sys.stderr)
    
    def get_tool(self, name: str) -> Optional[AITool]:
        """Get a tool by name"""
        return self.tools.get(name)
    
    def list_tools(self) -> List[AITool]:
        """List all available tools"""
        return list(self.tools.values())
    
    def get_openai_functions(self) -> List[Dict[str, Any]]:
        """Get tools in OpenAI function calling format"""
        return [tool.to_openai_function() for tool in self.tools.values()]
    
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool with given parameters"""
        tool = self.get_tool(tool_name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool not found: {tool_name}"
            }
        
        return await tool.execute(**parameters)
    
    def _register_re_tools(self):
        """Register reverse engineering analysis tools"""
        
        # Individual context getters for iterative analysis
        tools = [
            AITool(
                name="get_pseudocode",
                description="Get the pseudocode/decompiled code for the current function",
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_pseudocode
            ),
            AITool(
                name="get_assembly", 
                description="Get the assembly instructions for the current function",
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_assembly
            ),
            AITool(
                name="get_variables",
                description="Get the local variables and parameters for the current function", 
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_variables
            ),
            AITool(
                name="get_xrefs",
                description="Get cross-references (incoming/outgoing calls) for the current function",
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_xrefs
            ),
            AITool(
                name="get_strings",
                description="Get string references used by the current function",
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_strings
            ),
            AITool(
                name="search_functions",
                description="Search for functions by name or pattern",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Function name or pattern to search for"}
                    },
                    "required": ["query"]
                },
                handler=self._search_functions
            ),
            AITool(
                name="jump_to_function", 
                description="Jump to and analyze a specific function",
                parameters={
                    "type": "object",
                    "properties": {
                        "function_id": {"type": "string", "description": "ID of function to jump to"}
                    },
                    "required": ["function_id"]
                },
                handler=self._jump_to_function
            )
        ]
        
        for tool in tools:
            self.register_tool(tool)
    
    # Tool implementations that work with existing context system
    async def _get_pseudocode(self) -> str:
        """Get pseudocode for current session's function"""
        if not self.current_session_id:
            return "No active session"
        
        context = function_context_service.get_context_for_session(
            self.current_session_id, 
            {"pseudocode": True}
        )
        
        if context and "pseudocode" in context:
            return f"Pseudocode:\n{context['pseudocode']}"
        return "Pseudocode not available"
    
    async def _get_assembly(self) -> str:
        """Get assembly for current session's function"""
        if not self.current_session_id:
            return "No active session"
        
        context = function_context_service.get_context_for_session(
            self.current_session_id,
            {"assembly": True}
        )
        
        if context and "assembly" in context:
            assembly = context["assembly"]
            result = f"Assembly ({len(assembly)} instructions):\n"
            for instr in assembly[:20]:  # Show first 20 instructions
                addr = instr.get('address', '')
                mnemonic = instr.get('mnemonic', '')
                operands = instr.get('operands', '')
                result += f"{addr}: {mnemonic} {operands}\n"
            if len(assembly) > 20:
                result += f"... and {len(assembly) - 20} more instructions"
            return result
        return "Assembly not available"
    
    async def _get_variables(self) -> str:
        """Get variables for current session's function"""
        if not self.current_session_id:
            return "No active session"
        
        context = function_context_service.get_context_for_session(
            self.current_session_id,
            {"variables": True}
        )
        
        if context and "variables" in context:
            variables = context["variables"]
            result = f"Variables ({len(variables)}):\n"
            for var in variables:
                name = var.get('name', '')
                var_type = var.get('type', '')
                result += f"- {name} ({var_type})\n"
            return result
        return "Variables not available"
    
    async def _get_xrefs(self) -> str:
        """Get cross-references for current session's function"""
        if not self.current_session_id:
            return "No active session"
        
        context = function_context_service.get_context_for_session(
            self.current_session_id,
            {"xrefs": True}
        )
        
        if context and "xrefs" in context:
            xrefs = context["xrefs"]
            incoming = xrefs.get('incoming', [])
            outgoing = xrefs.get('outgoing', [])
            
            result = f"Cross-references:\n"
            result += f"Incoming calls ({len(incoming)}):\n"
            for ref in incoming[:10]:
                result += f"- {ref}\n"
            
            result += f"Outgoing calls ({len(outgoing)}):\n"
            for ref in outgoing[:10]:
                result += f"- {ref}\n"
            
            return result
        return "Cross-references not available"
    
    async def _get_strings(self) -> str:
        """Get strings for current session's function"""
        if not self.current_session_id:
            return "No active session"
        
        context = function_context_service.get_context_for_session(
            self.current_session_id,
            {"strings": True}
        )
        
        if context and "strings" in context:
            strings = context["strings"]
            result = f"Strings ({len(strings)}):\n"
            for string in strings:
                value = string.get('value', '')
                result += f'- "{value}"\n'
            return result
        return "Strings not available"
    
    async def _search_functions(self, query: str) -> str:
        """Search for functions matching query across the entire binary"""
        if not self.current_binary_name:
            return "No binary context available"
        
        all_functions = self.get_binary_functions()
        
        if not all_functions:
            return f"No functions available to search in binary {self.current_binary_name}"
        
        matches = []
        query_lower = query.lower()
        
        for func in all_functions:
            func_name = func.get('name', '').lower()
            address = func.get('address', '').lower()
            
            # Search by name or address
            if query_lower in func_name or query_lower in address:
                matches.append({
                    'name': func.get('name', 'Unknown'),
                    'address': func.get('address', 'Unknown')
                })
        
        if not matches:
            # If no matches, show available functions for debugging
            available = []
            for func in all_functions[:5]:  # Show first 5
                available.append(f"- {func.get('name', 'Unknown')} at {func.get('address', 'Unknown')}")
            
            result = f"No functions found matching '{query}' in {len(all_functions)} functions\n"
            result += f"Sample functions:\n"
            result += "\n".join(available)
            if len(all_functions) > 5:
                result += f"\n... and {len(all_functions) - 5} more"
            return result
        
        result = f"Found {len(matches)} function(s) matching '{query}':\n"
        for match in matches[:10]:  # Limit to 10 results
            result += f"- {match['name']} at {match['address']}\n"
        
        return result
    
    async def _jump_to_function(self, function_id: str) -> str:
        """Jump to a specific function by name or address"""
        if not self.current_binary_name:
            return "No binary context available"
        
        all_functions = self.get_binary_functions()
        
        if not all_functions:
            return f"No functions available in binary {self.current_binary_name}"
        
        # Try to find function by name or address
        found_function = None
        for func in all_functions:
            func_name = func.get('name', '')
            func_address = func.get('address', '')
            
            if (function_id.lower() == func_name.lower() or 
                function_id.lower() == func_address.lower()):
                found_function = func
                break
        
        if not found_function:
            # Show available functions
            available = []
            for func in all_functions[:5]:
                available.append(f"- {func.get('name', 'Unknown')} at {func.get('address', 'Unknown')}")
            
            result = f"Function '{function_id}' not found\n"
            result += f"Available functions ({len(all_functions)} total):\n"
            result += "\n".join(available)
            if len(all_functions) > 5:
                result += f"\n... and {len(all_functions) - 5} more"
            return result
        
        # Create a function ID for the context service (use address as ID)
        new_function_id = found_function.get('address', function_id)
        
        # Cache this function's data in the context service if not already cached
        if new_function_id not in function_context_service.current_function_data:
            function_context_service.set_current_function(new_function_id, {
                'function_name': found_function.get('name', 'Unknown'),
                'address': found_function.get('address', 'Unknown'),
                'binary_name': self.current_binary_name,
                'assembly': found_function.get('instructions', []),
                'variables': found_function.get('variables', []),
                'xrefs': found_function.get('xrefs', {}),
                'strings': found_function.get('strings', []),
                'cfg': found_function.get('cfg', {}),
                'pseudocode': found_function.get('pseudocode', '')
            })
        
        # Update the current session to point to this function
        if self.current_session_id:
            function_context_service.set_session_function(self.current_session_id, new_function_id)
        
        func_name = found_function.get('name', 'Unknown')
        address = found_function.get('address', 'Unknown')
        
        return f"Jumped to function: {func_name} at {address}. You can now analyze this function with other tools."

# Global instance
ai_tools_service = AIToolsService() 