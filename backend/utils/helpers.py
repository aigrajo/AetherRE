#!/usr/bin/env python3
import json
import hashlib
import os
import sys
from typing import Dict, Any, Optional, List, Tuple

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
    
    Args:
        binary_path: Path to the binary file (optional)
        function_data: List or dict of function data
        
    Returns:
        dict: Dictionary of incoming and outgoing cross-references
    """
    from backend.api.models.chat import XRef, XRefType
    
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