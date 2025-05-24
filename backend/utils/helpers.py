#!/usr/bin/env python3
import json
import hashlib
import os
import sys
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from enum import Enum

# Add CFG layout support
try:
    from .cfg_layout import compute_cfg_layout
except ImportError:
    # Fallback for when module is run directly
    from cfg_layout import compute_cfg_layout

class XRefType(Enum):
    DIRECT_CALL = "direct_call"
    INDIRECT_CALL = "indirect_call"
    JUMP = "jump"
    DATA_REFERENCE = "data_reference"

@dataclass
class XRef:
    source_func: str
    target_func: str
    xref_type: XRefType
    offset: int
    context: str = ""
    stack_state: Optional[Dict] = None

def get_cache_key(message: str, context: Dict[str, Any]) -> str:
    """Generate a cache key based on message and context.
    
    Args:
        message: The user message
        context: Function context including name, address, pseudocode, etc.
        
    Returns:
        str: MD5 hash of the message and relevant context
    """
    cache_data = {
        'message': message,
        'function_name': context.get('functionName'),
        'address': context.get('address'),
        'pseudocode_hash': hashlib.md5(context.get('pseudocode', '').encode()).hexdigest()
    }
    return hashlib.md5(json.dumps(cache_data, sort_keys=True).encode()).hexdigest()

def analyze_xrefs(binary_path: Optional[str], function_data: Any) -> dict:
    """Analyze cross-references for all functions in the binary.
    
    This function processes function data to identify relationships between functions,
    including direct calls, indirect calls, jumps, and data references.
    
    Args:
        binary_path: Path to the binary (unused in current implementation)
        function_data: Dictionary or list of function data
        
    Returns:
        Dictionary containing cross-reference data with 'incoming' and 'outgoing' keys
    """
    print(f"[DEBUG] analyze_xrefs called with binary_path: {binary_path}", file=sys.stderr)
    
    # Handle both dict and list formats
    if isinstance(function_data, list):
        # Convert list to dict using address as key
        func_dict = {}
        for func in function_data:
            if isinstance(func, dict) and 'address' in func:
                func_dict[func['address']] = func
        function_data = func_dict
    
    if not isinstance(function_data, dict):
        print(f"[DEBUG] Function data is not a dict: {type(function_data)}", file=sys.stderr)
        return {"incoming": {}, "outgoing": {}}
    
    print(f"[DEBUG] Processing {len(function_data)} functions for xref analysis", file=sys.stderr)
    
    # Get all target addresses for debugging
    if len(function_data) > 0:
        all_targets = set()
        for func_addr, func_data in function_data.items():
            for instr in func_data.get("instructions", []):
                if instr.get("type") == "call" and "target" in instr:
                    all_targets.add(instr["target"])
        
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
            elif instr.get("type") == "call" and instr.get("indirect"):
                xref = XRef(
                    source_func=func_addr,
                    target_func="indirect",
                    xref_type=XRefType.INDIRECT_CALL,
                    offset=instr.get("offset", 0),
                    context=instr.get("disassembly", "")
                )
                xrefs["outgoing"][func_addr].append(xref)
    
    # Convert XRef objects to dictionaries for JSON serialization
    result = {"incoming": {}, "outgoing": {}}
    for func_addr in xrefs["incoming"]:
        result["incoming"][func_addr] = [
            {
                "source_func": xref.source_func,
                "target_func": xref.target_func,
                "type": xref.xref_type.value,
                "offset": xref.offset,
                "context": xref.context
            }
            for xref in xrefs["incoming"][func_addr]
        ]
    
    for func_addr in xrefs["outgoing"]:
        result["outgoing"][func_addr] = [
            {
                "source_func": xref.source_func,
                "target_func": xref.target_func,
                "type": xref.xref_type.value,
                "offset": xref.offset,
                "context": xref.context
            }
            for xref in xrefs["outgoing"][func_addr]
        ]
    
    print(f"[DEBUG] Cross-reference analysis complete. Found {len(result['incoming'])} functions with incoming refs, {len(result['outgoing'])} with outgoing refs", file=sys.stderr)
    return result

def process_function_data_with_enhancements(function_data):
    """
    Process function data to add backend-computed enhancements like CFG layout.
    
    Args:
        function_data: Dictionary or list of function data
        
    Returns:
        Enhanced function data with CFG layouts computed
    """
    # Handle both dict and list formats
    if isinstance(function_data, list):
        enhanced_functions = []
        for func in function_data:
            enhanced_func = func.copy()
            # Process CFG if it exists
            if 'cfg' in enhanced_func and enhanced_func['cfg']:
                enhanced_func['cfg'] = compute_cfg_layout(enhanced_func['cfg'])
            enhanced_functions.append(enhanced_func)
        return enhanced_functions
    elif isinstance(function_data, dict):
        enhanced_data = {}
        for func_addr, func_data in function_data.items():
            enhanced_func = func_data.copy()
            # Process CFG if it exists
            if 'cfg' in enhanced_func and enhanced_func['cfg']:
                enhanced_func['cfg'] = compute_cfg_layout(enhanced_func['cfg'])
            enhanced_data[func_addr] = enhanced_func
        return enhanced_data
    
    return function_data 