#!/usr/bin/env python
# Ghidra function extractor script
# This script is meant to be run with Ghidra's headless analyzer

# @category AetherRE
# @author AetherRE

import os
import json
import sys
import time
from ghidra.program.model.symbol import RefType

# Simplified function to get pseudocode
def get_pseudocode(function):
    try:
        from ghidra.app.decompiler import DecompileOptions, DecompInterface
        decompiler = DecompInterface()
        options = DecompileOptions()
        decompiler.setOptions(options)
        decompiler.openProgram(currentProgram)
        
        result = decompiler.decompileFunction(function, 60, monitor)
        if result and result.getDecompiledFunction():
            return result.getDecompiledFunction().getC()
    except:
        pass
    return "// Error decompiling function"

def extract_instructions(func):
    instructions = []
    listing = currentProgram.getListing()
    for instr in listing.getInstructions(func.getBody(), True):
        instr_data = {
            "address": str(instr.getAddress()),
            "offset": int(instr.getAddress().getOffset() - func.getEntryPoint().getOffset()),
            "disassembly": instr.toString(),
            "type": None,
        }
        # Check for calls and jumps
        if instr.getFlowType().isCall():
            instr_data["type"] = "call"
            if instr.getFlows():
                targets = instr.getFlows()
                if len(targets) == 1:
                    instr_data["target"] = str(targets[0])
                else:
                    instr_data["indirect"] = True
        elif instr.getFlowType().isJump():
            instr_data["type"] = "jump"
            if instr.getFlows():
                targets = instr.getFlows()
                if len(targets) == 1:
                    instr_data["target"] = str(targets[0])
        # Data references
        refs = instr.getReferencesFrom()
        for ref in refs:
            if ref.getReferenceType().isData():
                instr_data["type"] = "data"
                instr_data["target"] = str(ref.getToAddress())
        if instr_data["type"]:
            instructions.append(instr_data)
    return instructions

def extract_local_variables(func):
    variables = []
    for var in func.getLocalVariables():
        var_data = {
            "name": var.getName(),
            "type": str(var.getDataType()),
            "offset": var.getStackOffset(),
            "size": var.getLength()
        }
        variables.append(var_data)
    return variables

def extract_local_strings(func):
    strings = []
    listing = currentProgram.getListing()
    
    # Get all references in the function
    for ref in currentProgram.getReferenceManager().getReferencesTo(func.getEntryPoint()):
        if ref.getReferenceType().isData():
            data = listing.getDataAt(ref.getFromAddress())
            if data and data.getDataType().getName() == "string":
                try:
                    string_value = str(data.getValue())
                    string_data = {
                        "address": str(data.getAddress()),
                        "value": string_value,
                        "length": len(string_value)
                    }
                    strings.append(string_data)
                except:
                    continue
    
    # Also check for string literals in the function body
    for instr in listing.getInstructions(func.getBody(), True):
        for ref in instr.getReferencesFrom():
            if ref.getReferenceType().isData():
                data = listing.getDataAt(ref.getToAddress())
                if data and data.getDataType().getName() == "string":
                    try:
                        string_value = str(data.getValue())
                        string_data = {
                            "address": str(data.getAddress()),
                            "value": string_value,
                            "length": len(string_value)
                        }
                        if string_data not in strings:  # Avoid duplicates
                            strings.append(string_data)
                    except:
                        continue
    
    return strings

def extract_assembly(func):
    assembly = []
    listing = currentProgram.getListing()
    for instr in listing.getInstructions(func.getBody(), True):
        asm_data = {
            "address": str(instr.getAddress()),
            "offset": int(instr.getAddress().getOffset() - func.getEntryPoint().getOffset()),
            "mnemonic": instr.getMnemonicString(),
            "operands": instr.getDefaultOperandRepresentation(0),
            "bytes": ''.join(['%02x' % b for b in instr.getBytes()])
        }
        assembly.append(asm_data)
    return assembly

def extract_xrefs(func):
    """Extract cross-references for a function"""
    xrefs = {
        "incoming": [],
        "outgoing": []
    }
    
    # Get incoming references to this function
    reference_manager = currentProgram.getReferenceManager()
    
    # Incoming references (calls TO this function)
    for ref in reference_manager.getReferencesTo(func.getEntryPoint()):
        if ref.getReferenceType().isCall():
            # Get the function that contains the source address
            source_func = currentProgram.getFunctionManager().getFunctionContaining(ref.getFromAddress())
            if source_func:
                xref_data = {
                    "source_func": str(source_func.getEntryPoint()),
                    "target_func": str(func.getEntryPoint()),
                    "type": "direct_call",
                    "offset": int(ref.getFromAddress().getOffset() - source_func.getEntryPoint().getOffset()),
                    "context": str(ref.getFromAddress()) + " -> " + str(ref.getToAddress())
                }
                xrefs["incoming"].append(xref_data)
    
    # Outgoing references (calls FROM this function)
    listing = currentProgram.getListing()
    for instr in listing.getInstructions(func.getBody(), True):
        for ref in instr.getReferencesFrom():
            if ref.getReferenceType().isCall():
                # Get the target function
                target_func = currentProgram.getFunctionManager().getFunctionAt(ref.getToAddress())
                if target_func:
                    xref_data = {
                        "source_func": str(func.getEntryPoint()),
                        "target_func": str(target_func.getEntryPoint()),
                        "type": "direct_call",
                        "offset": int(instr.getAddress().getOffset() - func.getEntryPoint().getOffset()),
                        "context": str(instr.getAddress()) + " -> " + str(ref.getToAddress())
                    }
                    xrefs["outgoing"].append(xref_data)
                else:
                    # External or indirect call
                    xref_data = {
                        "source_func": str(func.getEntryPoint()),
                        "target_func": str(ref.getToAddress()),
                        "type": "indirect_call" if ref.getReferenceType().isIndirect() else "external_call",
                        "offset": int(instr.getAddress().getOffset() - func.getEntryPoint().getOffset()),
                        "context": str(instr.getAddress()) + " -> " + str(ref.getToAddress())
                    }
                    xrefs["outgoing"].append(xref_data)
    
    return xrefs

def compute_cfg_layout_in_ghidra(cfg_data):
    """
    Compute CFG layout within Ghidra environment.
    This is a simplified version of the backend layout algorithm.
    """
    if not cfg_data or not cfg_data.get('nodes'):
        return cfg_data
    
    nodes = cfg_data['nodes']
    edges = cfg_data.get('edges', [])
    
    # Simple layout computation (port of frontend algorithm)
    def compute_node_dimensions(node):
        instruction_count = len(node.get('instructions', []))
        lines_to_show = min(instruction_count, 10)
        has_more_line = instruction_count > 10
        min_height = 25 + (lines_to_show * 15) + (15 if has_more_line else 0) + 15
        return {'width': 250, 'height': max(80, min_height)}
    
    if not nodes:
        layout = {'nodePositions': [], 'edgeRoutes': []}
    else:
        # Create node map
        node_map = {}
        for index, node in enumerate(nodes):
            node_map[node['id']] = index
        
        # Create adjacency lists
        outgoing = [[] for _ in range(len(nodes))]
        incoming = [[] for _ in range(len(nodes))]
        
        for edge in edges:
            source_idx = node_map.get(edge['source'])
            target_idx = node_map.get(edge['target'])
            if source_idx is not None and target_idx is not None:
                outgoing[source_idx].append(target_idx)
                incoming[target_idx].append(source_idx)
        
        # Assign layers
        layers = []
        node_layer = [-1] * len(nodes)
        stack = []
        visited = [False] * len(nodes)
        
        # Find roots
        for i in range(len(nodes)):
            if len(incoming[i]) == 0:
                stack.append(i)
        
        if len(stack) == 0 and len(nodes) > 0:
            stack.append(0)
        
        # BFS to assign layers
        layer = 0
        while stack:
            current_layer = []
            next_stack = []
            
            for node_idx in stack:
                if visited[node_idx]:
                    continue
                visited[node_idx] = True
                node_layer[node_idx] = layer
                current_layer.append(node_idx)
                
                for target_idx in outgoing[node_idx]:
                    if not visited[target_idx]:
                        next_stack.append(target_idx)
            
            layers.append(current_layer)
            stack = next_stack
            layer += 1
        
        # Handle unvisited nodes
        unvisited_nodes = []
        for i in range(len(nodes)):
            if not visited[i]:
                node_layer[i] = len(layers)
                unvisited_nodes.append(i)
        
        if unvisited_nodes:
            layers.append(unvisited_nodes)
        
        # Assign coordinates
        node_positions = []
        for idx, node in enumerate(nodes):
            layer_idx = node_layer[idx]
            layer_nodes = layers[layer_idx]
            layer_index = layer_nodes.index(idx)
            
            horizontal_spacing = 1200
            x = (layer_index + 1) * (horizontal_spacing / (len(layer_nodes) + 1))
            
            vertical_spacing = 250
            y = (layer_idx + 1) * vertical_spacing
            
            dimensions = compute_node_dimensions(node)
            
            node_positions.append({
                'id': node['id'],
                'x': x,
                'y': y,
                'width': dimensions['width'],
                'height': dimensions['height']
            })
        
        # Compute edge routes
        edge_routes = []
        pos_lookup = {pos['id']: pos for pos in node_positions}
        
        for edge in edges:
            source_pos = pos_lookup.get(edge['source'])
            target_pos = pos_lookup.get(edge['target'])
            
            if source_pos and target_pos:
                route = {
                    'source': edge['source'],
                    'target': edge['target'],
                    'points': [
                        {
                            'x': source_pos['x'],
                            'y': source_pos['y'] + source_pos['height'] / 2
                        },
                        {
                            'x': target_pos['x'],
                            'y': target_pos['y'] - target_pos['height'] / 2
                        }
                    ],
                    'type': edge.get('type', 'unconditional')
                }
                edge_routes.append(route)
        
        layout = {'nodePositions': node_positions, 'edgeRoutes': edge_routes}
    
    # Add layout to CFG data
    enhanced_cfg = cfg_data.copy()
    enhanced_cfg['layout'] = layout
    return enhanced_cfg

def extract_cfg(func):
    """Extract Control Flow Graph data for a function"""
    from ghidra.program.model.block import BasicBlockModel
    
    cfg_data = {
        "nodes": [],
        "edges": []
    }
    
    # Use BasicBlockModel to get code blocks
    blockModel = BasicBlockModel(func.getProgram())
    blocks = blockModel.getCodeBlocksContaining(func.getBody(), monitor)
    
    # Extract nodes (basic blocks)
    while blocks.hasNext():
        block = blocks.next()
        
        # Skip blocks that are not in this function
        if not func.getBody().contains(block.getFirstStartAddress()):
            continue
            
        node_data = {
            "id": str(block.getFirstStartAddress()),
            "start_address": str(block.getFirstStartAddress()),
            "end_address": str(block.getMaxAddress()),
            "size": block.getNumAddresses(),
            "instructions": []
        }
        
        # Add instructions in this block
        listing = func.getProgram().getListing()
        for instr in listing.getInstructions(block, True):
            node_data["instructions"].append({
                "address": str(instr.getAddress()),
                "mnemonic": instr.getMnemonicString(),
                "operands": instr.getDefaultOperandRepresentation(0)
            })
        
        cfg_data["nodes"].append(node_data)
        
        # Add edges for this block
        dests = block.getDestinations(monitor)
        while dests.hasNext():
            dest = dests.next()
            # Skip destinations outside this function
            if not func.getBody().contains(dest.getDestinationAddress()):
                continue
                
            edge_data = {
                "source": str(block.getFirstStartAddress()),
                "target": str(dest.getDestinationAddress()),
                "type": "conditional" if dest.getFlowType().isConditional() else "unconditional"
            }
            cfg_data["edges"].append(edge_data)
    
    # Compute layout information and add it to the CFG data
    cfg_with_layout = compute_cfg_layout_in_ghidra(cfg_data)
    
    return cfg_with_layout

# Main function
def run():
    print("[+] AetherRE Function Extractor Script")
    
    # Get the current program
    currentProgram = getCurrentProgram()
    if not currentProgram:
        print("[!] No program loaded")
        return
        
    program_name = currentProgram.getName()
    print("[+] Analyzing program: {}".format(program_name))
    
    # Get output directory from environment variable or fall back to default
    data_dir = os.getenv('GHIDRA_OUTPUT_DIR')
    if not data_dir:
        print("[!] GHIDRA_OUTPUT_DIR not set, using default location")
        try:
            user_dir = getSourceFile().getParentFile().getAbsolutePath()
        except:
            user_dir = os.getcwd()
        data_dir = os.path.join(user_dir, "data")
    
    print("[+] Using output directory: {}".format(data_dir))
    
    # Create output directory if it doesn't exist
    if not os.path.exists(data_dir):
        print("[+] Creating output directory: {}".format(data_dir))
        os.makedirs(data_dir)
    
    # Extract functions
    print("[+] Extracting functions...")
    functions = []
    total_functions = currentProgram.getFunctionManager().getFunctionCount()
    processed = 0
    
    for func in currentProgram.getFunctionManager().getFunctions(True):
        # Get pseudocode for the function
        pseudocode = get_pseudocode(func)
        instructions = extract_instructions(func)
        local_vars = extract_local_variables(func)
        local_strings = extract_local_strings(func)
        assembly = extract_assembly(func)
        xrefs = extract_xrefs(func)
        cfg = extract_cfg(func)  # Extract CFG data
        
        func_data = {
            "name": func.getName(),
            "address": str(func.getEntryPoint()),
            "size": func.getBody().getNumAddresses(),
            "signature": func.getSignature().toString(),
            "pseudocode": pseudocode,
            "instructions": instructions,
            "local_variables": local_vars,
            "local_strings": local_strings,
            "assembly": assembly,
            "xrefs": xrefs,
            "cfg": cfg  # Add CFG data to the output
        }
        functions.append(func_data)
        
        processed += 1
        # Emit progress for every function
        print("[PROGRESS] {}/{}".format(processed, total_functions))
        sys.stdout.flush()
        if processed % 10 == 0:
            print("[+] Processed {}/{} functions...".format(processed, total_functions))
    
    # Write to JSON file
    output_file = os.path.join(data_dir, "{}_functions.json".format(program_name))
    print("[+] Writing output to: {}".format(output_file))
    with open(output_file, "w") as f:
        json.dump(functions, f, indent=2)
    
    print("[+] Successfully extracted {} functions to {}".format(len(functions), output_file))

# Main execution - run unconditionally when loaded by Ghidra
try:
    run()
except Exception as e:
    print("[!] Failed to run script: {}".format(str(e)))
    import traceback
    print("[!] Traceback:")
    traceback.print_exc()

# Guard for direct execution
if __name__ == "__main__":
    print("[+] Script executed directly, not within Ghidra") 