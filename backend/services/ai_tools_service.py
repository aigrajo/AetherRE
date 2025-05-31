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
            ),
            AITool(
                name="get_imports",
                description="Get imported functions and libraries for the entire binary",
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_imports
            ),
            AITool(
                name="search_binary",
                description="Search for strings, constants, or patterns across the entire binary",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "What to search for"},
                        "search_type": {"type": "string", "description": "Type of search: 'strings', 'constants', or 'instructions'", "enum": ["strings", "constants", "instructions"]}
                    },
                    "required": ["query", "search_type"]
                },
                handler=self._search_binary
            ),
            AITool(
                name="analyze_address",
                description="Get detailed information about what exists at a specific memory address",
                parameters={
                    "type": "object",
                    "properties": {
                        "address": {"type": "string", "description": "Memory address to analyze (e.g., '0x401000')"}
                    },
                    "required": ["address"]
                },
                handler=self._analyze_address
            ),
            AITool(
                name="get_constants",
                description="Extract numeric constants and magic numbers from current function",
                parameters={"type": "object", "properties": {}, "required": []},
                handler=self._get_constants
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
            
            result = f"Cross-references:\n\n"
            
            # Format incoming calls
            result += f"Incoming calls ({len(incoming)}):\n"
            if incoming:
                for i, ref in enumerate(incoming[:10]):
                    if isinstance(ref, dict):
                        source = ref.get('source_func', 'Unknown')
                        ref_type = ref.get('type', 'unknown')
                        context_info = ref.get('context', '')
                        result += f"- {source} ({ref_type})"
                        if context_info:
                            result += f" - {context_info}"
                        result += "\n"
                    else:
                        result += f"- {ref}\n"
                    
                if len(incoming) > 10:
                    result += f"... and {len(incoming) - 10} more incoming calls\n"
            else:
                result += "- No incoming calls found\n"
            
            result += "\n"
            
            # Format outgoing calls
            result += f"Outgoing calls ({len(outgoing)}):\n"
            if outgoing:
                for i, ref in enumerate(outgoing[:10]):
                    if isinstance(ref, dict):
                        target = ref.get('target_func', 'Unknown')
                        ref_type = ref.get('type', 'unknown')
                        context_info = ref.get('context', '')
                        result += f"- {target} ({ref_type})"
                        if context_info:
                            result += f" - {context_info}"
                        result += "\n"
                    else:
                        result += f"- {ref}\n"
                        
                if len(outgoing) > 10:
                    result += f"... and {len(outgoing) - 10} more outgoing calls\n"
            else:
                result += "- No outgoing calls found\n"
            
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
                'assembly': found_function.get('assembly', []),
                'variables': found_function.get('local_variables', []),
                'xrefs': found_function.get('xrefs', {}),
                'strings': found_function.get('local_strings', []),
                'cfg': found_function.get('cfg', {}),
                'pseudocode': found_function.get('pseudocode', '')
            })
        
        # Update the current session to point to this function
        if self.current_session_id:
            function_context_service.set_session_function(self.current_session_id, new_function_id)
        
        func_name = found_function.get('name', 'Unknown')
        address = found_function.get('address', 'Unknown')
        
        return f"Jumped to function: {func_name} at {address}. You can now analyze this function with other tools."

    async def _get_imports(self) -> str:
        """Get imported functions and libraries for the entire binary"""
        if not self.current_binary_name:
            return "No binary context available"
        
        all_functions = self.get_binary_functions()
        
        if not all_functions:
            return f"No binary data available for {self.current_binary_name}"
        
        # Look for imports in the binary data
        # Check if we have imports data structure
        imports = set()
        libraries = set()
        
        # Parse through functions looking for external calls/imports
        for func in all_functions:
            # Check assembly instructions for call instructions to external functions
            instructions = func.get('instructions', [])
            for instr in instructions:
                mnemonic = instr.get('mnemonic', '').lower()
                operands = instr.get('operands', '')
                
                if mnemonic in ['call', 'jmp']:
                    # Look for external function calls (usually have specific patterns)
                    if '@' in operands or '.dll' in operands.lower():
                        imports.add(operands)
                    elif operands.startswith('KERNEL32.') or operands.startswith('USER32.') or operands.startswith('NTDLL.'):
                        imports.add(operands)
                        library = operands.split('.')[0]
                        libraries.add(library)
            
            # Also check xrefs for external references
            xrefs = func.get('xrefs', {})
            outgoing = xrefs.get('outgoing', [])
            for ref in outgoing:
                if isinstance(ref, str) and ('.' in ref and any(lib in ref.upper() for lib in ['KERNEL32', 'USER32', 'NTDLL', 'ADVAPI32', 'WS2_32'])):
                    imports.add(ref)
                    if '.' in ref:
                        library = ref.split('.')[0]
                        libraries.add(library)
        
        result = f"Binary Imports Analysis:\n"
        
        if libraries:
            result += f"\nLibraries ({len(libraries)}):\n"
            for lib in sorted(libraries)[:10]:
                result += f"- {lib}\n"
            if len(libraries) > 10:
                result += f"... and {len(libraries) - 10} more libraries\n"
        
        if imports:
            result += f"\nImported Functions ({len(imports)}):\n"
            for imp in sorted(imports)[:15]:
                result += f"- {imp}\n"
            if len(imports) > 15:
                result += f"... and {len(imports) - 15} more imports\n"
        
        if not imports and not libraries:
            result += "No clear import patterns detected in available data.\n"
            result += "This could indicate a stripped binary or limited data extraction."
        
        return result
    
    async def _search_binary(self, query: str, search_type: str) -> str:
        """Search for strings, constants, or patterns across the entire binary"""
        if not self.current_binary_name:
            return "No binary context available"
        
        all_functions = self.get_binary_functions()
        
        if not all_functions:
            return f"No binary data available for {self.current_binary_name}"
        
        query_lower = query.lower()
        matches = []
        
        if search_type == "strings":
            # Search for string matches across all functions
            for func in all_functions:
                func_name = func.get('name', 'Unknown')
                func_addr = func.get('address', 'Unknown')
                
                # Search in strings array
                strings = func.get('strings', [])
                for string_obj in strings:
                    string_val = string_obj.get('value', '') if isinstance(string_obj, dict) else str(string_obj)
                    if query_lower in string_val.lower():
                        matches.append(f"{func_name} ({func_addr}): \"{string_val}\"")
                
                # Search in pseudocode
                pseudocode = func.get('pseudocode', '')
                if query_lower in pseudocode.lower():
                    # Find the line containing the query
                    lines = pseudocode.split('\n')
                    for i, line in enumerate(lines):
                        if query_lower in line.lower():
                            matches.append(f"{func_name} ({func_addr}): Line {i+1}: {line.strip()}")
                            if len(matches) >= 20:  # Limit matches per function
                                break
        
        elif search_type == "constants":
            # Search for numeric constants
            import re
            for func in all_functions:
                func_name = func.get('name', 'Unknown')
                func_addr = func.get('address', 'Unknown')
                
                # Search in assembly instructions
                instructions = func.get('instructions', [])
                for instr in instructions:
                    operands = instr.get('operands', '')
                    if query in operands:
                        matches.append(f"{func_name} ({func_addr}): {instr.get('address', '')}: {instr.get('mnemonic', '')} {operands}")
                
                # Search in pseudocode for numeric values
                pseudocode = func.get('pseudocode', '')
                if query in pseudocode:
                    lines = pseudocode.split('\n')
                    for i, line in enumerate(lines):
                        if query in line:
                            matches.append(f"{func_name} ({func_addr}): Line {i+1}: {line.strip()}")
        
        elif search_type == "instructions":
            # Search for instruction patterns
            for func in all_functions:
                func_name = func.get('name', 'Unknown')
                func_addr = func.get('address', 'Unknown')
                
                instructions = func.get('instructions', [])
                for instr in instructions:
                    mnemonic = instr.get('mnemonic', '')
                    operands = instr.get('operands', '')
                    full_instr = f"{mnemonic} {operands}".lower()
                    
                    if query_lower in full_instr:
                        matches.append(f"{func_name} ({func_addr}): {instr.get('address', '')}: {mnemonic} {operands}")
        
        # Format results
        result = f"Search Results for \"{query}\" (type: {search_type}):\n\n"
        
        if not matches:
            result += "No matches found.\n"
            result += f"Searched across {len(all_functions)} functions in {self.current_binary_name}."
        else:
            result += f"Found {len(matches)} matches:\n"
            for match in matches[:25]:  # Limit to 25 results
                result += f"- {match}\n"
            
            if len(matches) > 25:
                result += f"\n... and {len(matches) - 25} more matches (showing first 25)"
        
        return result
    
    async def _analyze_address(self, address: str) -> str:
        """Get detailed information about what exists at a specific memory address"""
        if not self.current_binary_name:
            return "No binary context available"
        
        all_functions = self.get_binary_functions()
        
        if not all_functions:
            return f"No binary data available for {self.current_binary_name}"
        
        # Normalize address format
        if not address.startswith('0x'):
            if address.startswith('0X'):
                address = '0x' + address[2:]
            else:
                address = '0x' + address
        
        address_lower = address.lower()
        result = f"Analysis of address {address}:\n\n"
        
        # Check if this address is a function entry point
        for func in all_functions:
            func_addr = func.get('address', '').lower()
            if func_addr == address_lower:
                func_name = func.get('name', 'Unknown')
                result += f"✓ Function Entry Point: {func_name}\n"
                result += f"  Function Size: {len(func.get('instructions', []))} instructions\n"
                result += f"  Variables: {len(func.get('variables', []))} local variables\n"
                result += f"  Strings: {len(func.get('strings', []))} string references\n"
                
                # Show first few instructions
                instructions = func.get('instructions', [])
                if instructions:
                    result += f"  First few instructions:\n"
                    for instr in instructions[:5]:
                        result += f"    {instr.get('address', '')}: {instr.get('mnemonic', '')} {instr.get('operands', '')}\n"
                
                return result
        
        # Check if this address appears in any instruction operands
        found_in_instructions = []
        for func in all_functions:
            func_name = func.get('name', 'Unknown')
            func_addr = func.get('address', 'Unknown')
            
            instructions = func.get('instructions', [])
            for instr in instructions:
                operands = instr.get('operands', '')
                if address_lower in operands.lower():
                    found_in_instructions.append({
                        'function': func_name,
                        'function_addr': func_addr,
                        'instruction_addr': instr.get('address', ''),
                        'instruction': f"{instr.get('mnemonic', '')} {operands}"
                    })
        
        if found_in_instructions:
            result += f"✓ Referenced in {len(found_in_instructions)} instruction(s):\n"
            for ref in found_in_instructions[:10]:
                result += f"  {ref['function']} ({ref['function_addr']}): {ref['instruction_addr']}: {ref['instruction']}\n"
            
            if len(found_in_instructions) > 10:
                result += f"  ... and {len(found_in_instructions) - 10} more references\n"
        
        # Check if this address appears in strings
        found_in_strings = []
        for func in all_functions:
            func_name = func.get('name', 'Unknown')
            func_addr = func.get('address', 'Unknown')
            
            strings = func.get('strings', [])
            for string_obj in strings:
                string_val = string_obj.get('value', '') if isinstance(string_obj, dict) else str(string_obj)
                if address_lower in string_val.lower():
                    found_in_strings.append(f"{func_name} ({func_addr}): \"{string_val}\"")
        
        if found_in_strings:
            result += f"\n✓ Found in strings:\n"
            for string_ref in found_in_strings[:5]:
                result += f"  {string_ref}\n"
        
        # Check if address falls within any function's range
        address_int = int(address, 16) if address.startswith('0x') else int(address, 16)
        for func in all_functions:
            func_addr_str = func.get('address', '')
            if func_addr_str.startswith('0x'):
                func_addr_int = int(func_addr_str, 16)
                instructions = func.get('instructions', [])
                
                if instructions:
                    # Estimate function size from instructions
                    last_instr_addr = instructions[-1].get('address', func_addr_str)
                    if last_instr_addr.startswith('0x'):
                        last_addr_int = int(last_instr_addr, 16)
                        
                        if func_addr_int <= address_int <= last_addr_int + 10:  # +10 for instruction size
                            result += f"\n✓ Address falls within function: {func.get('name', 'Unknown')} ({func_addr_str})\n"
                            
                            # Find the specific instruction at or near this address
                            for instr in instructions:
                                instr_addr = instr.get('address', '')
                                if instr_addr.startswith('0x'):
                                    instr_addr_int = int(instr_addr, 16)
                                    if instr_addr_int == address_int:
                                        result += f"  Exact instruction: {instr.get('mnemonic', '')} {instr.get('operands', '')}\n"
                                        break
                            break
        
        if "✓" not in result:
            result += "❌ Address not found in available function data.\n"
            result += "This could be:\n"
            result += "- Data section address\n"
            result += "- External library address\n"
            result += "- Invalid/unmapped address\n"
            result += "- Address outside analyzed functions\n"
        
        return result
    
    async def _get_constants(self) -> str:
        """Extract numeric constants and magic numbers from current function"""
        if not self.current_session_id:
            return "No active session"
        
        context = function_context_service.get_context_for_session(
            self.current_session_id,
            {"assembly": True, "pseudocode": True}
        )
        
        if not context:
            return "Function context not available"
        
        constants = set()
        import re
        
        # Extract constants from assembly instructions
        if "assembly" in context and context["assembly"]:
            for instr in context["assembly"]:
                operands = instr.get('operands', '')
                
                # Find hex constants (0x...)
                hex_matches = re.findall(r'0x[0-9a-fA-F]+', operands)
                constants.update(hex_matches)
                
                # Find decimal constants in operands (large numbers likely significant)
                decimal_matches = re.findall(r'\b(?<!0x)(?<![a-fA-F])[0-9]{4,}\b', operands)
                constants.update(decimal_matches)
                
                # Find immediate values with specific prefixes
                immediate_matches = re.findall(r'[#$]\w+', operands)
                constants.update(immediate_matches)
        
        # Extract constants from pseudocode
        if "pseudocode" in context and context["pseudocode"]:
            pseudocode = context["pseudocode"]
            
            # Find hex constants in pseudocode
            hex_in_pseudo = re.findall(r'0x[0-9a-fA-F]+', pseudocode)
            constants.update(hex_in_pseudo)
            
            # Find large decimal numbers (likely significant constants)
            decimal_in_pseudo = re.findall(r'\b[0-9]{4,}\b', pseudocode)
            constants.update(decimal_in_pseudo)
            
            # Find quoted numeric strings that might be significant
            quoted_nums = re.findall(r'"[0-9a-fA-F]{4,}"', pseudocode)
            constants.update(quoted_nums)
        
        # Filter and categorize constants
        hex_constants = []
        decimal_constants = []
        special_constants = []
        
        for const in constants:
            if const.startswith('0x') or const.startswith('0X'):
                # Analyze hex constants
                try:
                    value = int(const, 16)
                    # Check for well-known magic numbers
                    if const.lower() in ['0x5a4d', '0x4d5a']:  # PE signature
                        special_constants.append(f"{const} (PE signature 'MZ')")
                    elif const.lower() in ['0x00004550', '0x50450000']:  # PE header
                        special_constants.append(f"{const} (PE header 'PE')")
                    elif const.lower() in ['0xdeadbeef', '0xbeefdead']:
                        special_constants.append(f"{const} (Debug marker)")
                    elif const.lower() in ['0xcafebabe', '0xbabecafe']:
                        special_constants.append(f"{const} (Java class file)")
                    elif const.lower() in ['0xfeedfeed', '0xfeedface']:
                        special_constants.append(f"{const} (Mach-O signature)")
                    elif value == 0xFFFFFFFF or value == 0xFFFF:
                        special_constants.append(f"{const} (Max value marker)")
                    elif 0x100 <= value <= 0xFFFF and (value & 0xFF) == 0:
                        special_constants.append(f"{const} (Possible size/offset)")
                    else:
                        hex_constants.append(const)
                except ValueError:
                    hex_constants.append(const)
            elif const.startswith('#') or const.startswith('$'):
                special_constants.append(f"{const} (Immediate value)")
            elif const.startswith('"') and const.endswith('"'):
                special_constants.append(f"{const} (Numeric string)")
            else:
                try:
                    value = int(const)
                    # Analyze decimal constants for significance
                    if value in [80, 443, 21, 22, 23, 25, 53, 110, 995]:  # Common ports
                        special_constants.append(f"{const} (Network port)")
                    elif value in [1024, 2048, 4096, 8192, 16384]:  # Powers of 2
                        special_constants.append(f"{const} (Buffer size)")
                    elif 1000000 <= value <= 999999999:  # Large numbers
                        special_constants.append(f"{const} (Large numeric constant)")
                    elif value in [256, 512, 768, 1024]:  # Common sizes
                        special_constants.append(f"{const} (Possible buffer/array size)")
                    else:
                        decimal_constants.append(const)
                except ValueError:
                    decimal_constants.append(const)
        
        # Build result
        result = f"Constants in current function:\n\n"
        
        if special_constants:
            result += f"Significant Constants ({len(special_constants)}):\n"
            for const in sorted(special_constants)[:15]:
                result += f"- {const}\n"
            if len(special_constants) > 15:
                result += f"... and {len(special_constants) - 15} more significant constants\n"
            result += "\n"
        
        if hex_constants:
            result += f"Hex Constants ({len(hex_constants)}):\n"
            for const in sorted(hex_constants, key=lambda x: int(x, 16))[:10]:
                try:
                    decimal_val = int(const, 16)
                    result += f"- {const} (decimal: {decimal_val})\n"
                except ValueError:
                    result += f"- {const}\n"
            if len(hex_constants) > 10:
                result += f"... and {len(hex_constants) - 10} more hex constants\n"
            result += "\n"
        
        if decimal_constants:
            result += f"Decimal Constants ({len(decimal_constants)}):\n"
            for const in sorted(decimal_constants, key=lambda x: int(x) if x.isdigit() else 0)[:10]:
                try:
                    hex_val = hex(int(const))
                    result += f"- {const} (hex: {hex_val})\n"
                except ValueError:
                    result += f"- {const}\n"
            if len(decimal_constants) > 10:
                result += f"... and {len(decimal_constants) - 10} more decimal constants\n"
        
        if not special_constants and not hex_constants and not decimal_constants:
            result += "No significant constants found in current function.\n"
            result += "This could indicate:\n"
            result += "- Function uses only variables and parameters\n"
            result += "- Constants are defined elsewhere (global scope)\n"
            result += "- Very simple function with minimal hardcoded values"
        
        return result


# Create global instance
ai_tools_service = AIToolsService() 