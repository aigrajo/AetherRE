#!/usr/bin/env python
# Ghidra function extractor script
# This script is meant to be run with Ghidra's headless analyzer

# @category AetherRE
# @author AetherRE

import os
import json
import sys
import time

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
        
        func_data = {
            "name": func.getName(),
            "address": str(func.getEntryPoint()),
            "size": func.getBody().getNumAddresses(),
            "signature": func.getSignature().toString(),
            "pseudocode": pseudocode
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