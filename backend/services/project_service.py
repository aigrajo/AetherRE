#!/usr/bin/env python3
"""
Project service for handling project data collection, processing, and management.
Handles all project logic that was previously on the frontend.
"""

import os
import json
import hashlib
import re
import aiohttp
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

from backend.services.notes_service import get_note, get_tags

class ProjectService:
    """Service for managing project data and operations"""
    
    PROJECT_VERSION = "1.0"
    
    @staticmethod
    def calculate_binary_hash(file_path: str) -> str:
        """
        Calculate SHA256 hash of a binary file.
        
        Args:
            file_path: Path to the binary file
            
        Returns:
            SHA256 hash as hex string
        """
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                # Read file in chunks to handle large files
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)
            return sha256_hash.hexdigest()
        except Exception as e:
            raise Exception(f"Failed to calculate binary hash: {str(e)}")
    
    @staticmethod
    def clean_binary_name(name: str) -> str:
        """
        Clean binary name for filesystem compatibility.
        
        Args:
            name: Original binary name
            
        Returns:
            Cleaned binary name
        """
        return re.sub(r'[^\w\d]', '_', name)
    
    @staticmethod
    def get_binary_name_without_extension(filename: str) -> str:
        """
        Get binary name without extension.
        
        Args:
            filename: Original filename
            
        Returns:
            Filename without extension
        """
        return os.path.splitext(filename)[0]
    
    @staticmethod
    def collect_custom_function_names(functions_data: Dict) -> Dict[str, str]:
        """
        Collect custom function names from functions data.
        Maps original function names to custom names (like variables do).
        
        Args:
            functions_data: Functions data structure
            
        Returns:
            Dictionary mapping original function names to custom names
        """
        function_name_mappings = {}
        
        print('Collecting custom function names...')
        print('functions_data:', bool(functions_data))
        print('functions_data functions length:', len(functions_data.get('functions', [])) if functions_data else 0)
        
        if functions_data and functions_data.get('functions'):
            for index, func in enumerate(functions_data['functions']):
                print(f"Function {index}: address={func.get('address')}, name=\"{func.get('name')}\", originalName=\"{func.get('originalName', 'none')}\"")
                
                # Check if this function has been renamed (has originalName property)
                if (func.get('originalName') and 
                    func.get('name') != func.get('originalName')):
                    # Store mapping: original name -> custom name
                    function_name_mappings[func['originalName']] = func['name']
                    print(f"✓ Saving custom function mapping: \"{func['originalName']}\" -> \"{func['name']}\"")
                elif (func.get('name') and 
                      not func['name'].startswith('FUN_') and 
                      not func['name'].startswith('SUB_')):
                    
                    # Function was custom named but no original name tracked
                    # This shouldn't happen with proper tracking, but handle it as fallback
                    function_name_mappings[func['name']] = func['name']
                    print(f"⚠ Saving function without original name tracking: \"{func['name']}\"")
                else:
                    print(f"✗ Skipping default/unchanged function name: \"{func.get('name')}\"")
        else:
            print('No functionsData available for collecting custom function names')
        
        print(f"Collected {len(function_name_mappings)} custom function name mappings:", function_name_mappings)
        return function_name_mappings
    
    @staticmethod
    def collect_custom_variable_names(functions_data: Dict) -> Dict[str, Dict[str, str]]:
        """
        Collect custom variable names from all functions.
        Matches the exact logic from frontend/renderer/projectManager.js
        
        Args:
            functions_data: Functions data structure
            
        Returns:
            Dictionary mapping function addresses to variable name mappings
        """
        variable_names = {}
        
        print('Collecting custom variable names...')
        print('functions_data:', bool(functions_data))
        print('functions_data functions length:', len(functions_data.get('functions', [])) if functions_data else 0)
        
        if functions_data and functions_data.get('functions'):
            for function_index, func in enumerate(functions_data['functions']):
                print(f"Checking function {function_index}: address={func.get('address')}, variables={len(func.get('local_variables', []))}")
                
                if func.get('local_variables') and isinstance(func['local_variables'], list):
                    function_var_names = {}
                    
                    for var_index, variable in enumerate(func['local_variables']):
                        print(f"  Variable {var_index}: name=\"{variable.get('name')}\", originalName=\"{variable.get('originalName', 'none')}\"")
                        
                        # Check if this variable has been renamed (has originalName property)
                        if (variable.get('originalName') and 
                            variable.get('name') != variable.get('originalName')):
                            # Store mapping: original name -> custom name
                            function_var_names[variable['originalName']] = variable['name']
                            print(f"    ✓ Saving custom variable mapping: \"{variable['originalName']}\" -> \"{variable['name']}\"")
                        elif (variable.get('name') and 
                              not variable['name'].startswith('local_') and 
                              not variable['name'].startswith('param_') and
                              not variable['name'].startswith('iVar') and
                              not variable['name'].startswith('uVar') and
                              variable['name'] != 'unnamed'):
                            
                            # Variable was custom named from the start (no original name tracked)
                            # This shouldn't happen with proper tracking, but handle it as fallback
                            function_var_names[variable['name']] = variable['name']
                            print(f"    ⚠ Saving variable without original name tracking: \"{variable['name']}\"")
                        else:
                            print(f"    ✗ Skipping default/unchanged variable name: \"{variable.get('name')}\"")
                    
                    if function_var_names:
                        variable_names[func['address']] = function_var_names
                        print(f"✓ Function {func['address']} has {len(function_var_names)} custom variables")
                    else:
                        print(f"✗ Function {func['address']} has no custom variables")
                else:
                    print(f"  Function {func['address']} has no local_variables array")
        else:
            print('No functionsData available for collecting custom variable names')
        
        print(f"Collected variable names for {len(variable_names)} functions:", variable_names)
        return variable_names
    
    @staticmethod
    async def collect_all_notes(binary_name: str, functions_data: Dict) -> Dict[str, str]:
        """
        Collect all notes for functions in the binary.
        
        Args:
            binary_name: Name of the binary
            functions_data: Functions data structure
            
        Returns:
            Dictionary mapping function addresses to note content
        """
        notes = {}
        
        if not functions_data or 'functions' not in functions_data:
            return notes
        
        clean_binary_name = ProjectService.clean_binary_name(binary_name)
        
        for func in functions_data['functions']:
            try:
                note_content = get_note(clean_binary_name, func['address'])
                if note_content and note_content.strip():
                    notes[func['address']] = note_content
            except Exception as e:
                print(f"Warning: Failed to get note for function {func['address']}: {e}")
        
        print(f"Collected {len(notes)} function notes")
        return notes
    
    @staticmethod
    async def collect_all_tags(binary_name: str, functions_data: Dict) -> Dict[str, List[Dict]]:
        """
        Collect all tags for functions in the binary.
        
        Args:
            binary_name: Name of the binary
            functions_data: Functions data structure
            
        Returns:
            Dictionary mapping function addresses to tag lists
        """
        tags = {}
        
        if not functions_data or 'functions' not in functions_data:
            return tags
        
        clean_binary_name = ProjectService.clean_binary_name(binary_name)
        
        for func in functions_data['functions']:
            try:
                func_tags = get_tags(clean_binary_name, func['address'])
                if func_tags:
                    tags[func['address']] = func_tags
            except Exception as e:
                print(f"Warning: Failed to get tags for function {func['address']}: {e}")
        
        print(f"Collected tags for {len(tags)} functions")
        return tags
    
    @staticmethod
    def collect_chat_sessions() -> List[Dict]:
        """
        Collect chat sessions data from the chat service.
        
        Returns:
            List of chat session data
        """
        try:
            # Import here to avoid circular imports
            from backend.services.chat import get_all_sessions
            
            sessions = get_all_sessions()
            print(f"Collected {len(sessions)} chat sessions")
            return sessions
            
        except Exception as e:
            print(f"Warning: Failed to collect chat sessions: {e}")
            return []
    
    @staticmethod
    async def collect_project_data(
        project_name: Optional[str],
        binary_name: str,
        binary_path: str,
        functions_data: Dict
    ) -> Dict[str, Any]:
        """
        Collect all project data for saving.
        Matches the exact logic from frontend/renderer/projectManager.js
        
        Args:
            project_name: Optional project name
            binary_name: Name of the binary file
            binary_path: Path to the binary file
            functions_data: Functions data structure
            
        Returns:
            Complete project data structure
        """
        print("=== Starting Project Data Collection ===")
        print(f"Binary: {binary_name}")
        print(f"File path: {binary_path}")
        
        # Calculate binary hash for verification
        print("Calculating binary hash...")
        binary_hash = ProjectService.calculate_binary_hash(binary_path)
        print(f"Binary hash: {binary_hash}")
        
        clean_binary_name = ProjectService.get_binary_name_without_extension(binary_name)
        print(f"Clean binary name: {clean_binary_name}")
        
        # Use provided name or generate default
        final_project_name = project_name or clean_binary_name
        print(f"Project name: {final_project_name}")
        
        # Collect all metadata
        print("=== Collecting project metadata ===")
        
        print("1. Collecting custom function names...")
        custom_function_names = ProjectService.collect_custom_function_names(functions_data)
        print(f"   Result: {len(custom_function_names)} custom function names")
        
        print("2. Collecting custom variable names...")
        custom_variable_names = ProjectService.collect_custom_variable_names(functions_data)
        print(f"   Result: {len(custom_variable_names)} functions with custom variables")
        
        print("3. Collecting notes...")
        notes = await ProjectService.collect_all_notes(clean_binary_name, functions_data)
        print(f"   Result: {len(notes)} functions with notes")
        
        print("4. Collecting tags...")
        tags = await ProjectService.collect_all_tags(clean_binary_name, functions_data)
        print(f"   Result: {len(tags)} functions with tags")
        
        print("5. Collecting chat sessions...")
        chat_sessions = ProjectService.collect_chat_sessions()
        print(f"   Result: {len(chat_sessions)} chat sessions")
        
        print("=== Building project data structure ===")
        
        # Build project data structure
        project_data = {
            "aetherre_project": {
                "version": ProjectService.PROJECT_VERSION,
                "name": final_project_name,
                "created": datetime.now().isoformat(),
                "modified": datetime.now().isoformat()
            },
            "target_binary": {
                "filename": binary_name,
                "sha256": binary_hash,
                "analysis_started": datetime.now().isoformat()
            },
            "customizations": {
                "function_names": custom_function_names,
                "variable_names": custom_variable_names,
                "notes": notes,
                "tags": tags
            },
            "chat_history": {
                "sessions": chat_sessions
            }
        }
        
        print("=== Project Data Collection Summary ===")
        print(f"Function names: {len(custom_function_names)}")
        print(f"Variable names: {len(custom_variable_names)}")
        print(f"Notes: {len(notes)}")
        print(f"Tags: {len(tags)}")
        print(f"Chat sessions: {len(chat_sessions)}")
        print("=== End Collection Summary ===")
        
        return project_data
    
    @staticmethod
    def verify_project_compatibility(project_data: Dict, current_binary_path: str) -> Tuple[bool, Optional[str]]:
        """
        Verify that a project file is compatible with the current binary.
        
        Args:
            project_data: Loaded project data
            current_binary_path: Path to the currently loaded binary
            
        Returns:
            Tuple of (is_compatible, error_message)
        """
        try:
            # Calculate current binary hash
            current_hash = ProjectService.calculate_binary_hash(current_binary_path)
            
            # Get expected hash from project
            expected_hash = project_data.get('target_binary', {}).get('sha256')
            expected_filename = project_data.get('target_binary', {}).get('filename')
            
            if expected_hash != current_hash:
                current_filename = os.path.basename(current_binary_path)
                return False, (
                    f"Project file mismatch!\n\n"
                    f"Project expects: {expected_filename}\n"
                    f"You have loaded: {current_filename}\n\n"
                    f"Please load the correct binary file first."
                )
            
            return True, None
            
        except Exception as e:
            return False, f"Error verifying project compatibility: {str(e)}"
    
    @staticmethod
    def apply_custom_function_names(functions_data: Dict, function_names: Dict[str, str]) -> int:
        """
        Apply custom function names to functions data.
        
        Args:
            functions_data: Functions data structure to modify
            function_names: Dictionary mapping original names to custom names
            
        Returns:
            Number of function names applied
        """
        applied_count = 0
        
        if not functions_data or 'functions' not in functions_data:
            return applied_count
        
        for func in functions_data['functions']:
            # Check if there's a custom name for this function's current name
            if func.get('name') in function_names:
                custom_name = function_names[func['name']]
                
                # Set the original name for tracking (if not already set)
                if not func.get('originalName'):
                    func['originalName'] = func['name']
                
                # Apply the custom name
                func['name'] = custom_name
                applied_count += 1
        
        return applied_count
    
    @staticmethod
    def apply_custom_variable_names(functions_data: Dict, variable_names: Dict[str, Dict[str, str]]) -> int:
        """
        Apply custom variable names to functions data.
        
        Args:
            functions_data: Functions data structure to modify
            variable_names: Dictionary mapping function addresses to variable name mappings
            
        Returns:
            Number of variable names applied
        """
        applied_count = 0
        
        if not functions_data or 'functions' not in functions_data:
            return applied_count
        
        for func in functions_data['functions']:
            if func['address'] in variable_names and func.get('local_variables'):
                func_var_names = variable_names[func['address']]
                
                for variable in func['local_variables']:
                    # Check if there's a custom name for this variable's current name
                    if variable.get('name') in func_var_names:
                        custom_name = func_var_names[variable['name']]
                        
                        # Set the original name for tracking (if not already set)
                        if not variable.get('originalName'):
                            variable['originalName'] = variable['name']
                        
                        # Apply the custom name
                        variable['name'] = custom_name
                        applied_count += 1
        
        return applied_count
    
    @staticmethod
    async def apply_complete_project(
        functions_data: Dict,
        project_data: Dict,
        binary_path: str,
        binary_name: str
    ) -> Tuple[Dict, Dict]:
        """
        Apply all project customizations in a single atomic operation.
        Handles function names, variable names, pseudocode updates, notes, tags, and chat sessions.
        
        Args:
            functions_data: Functions data structure to modify
            project_data: Complete project data from file
            binary_path: Path to the binary file
            binary_name: Name of the binary file
            
        Returns:
            Tuple of (updated_functions_data, application_results)
        """
        print("=== Starting Complete Project Application ===")
        
        # Verify compatibility first
        is_compatible, error_msg = ProjectService.verify_project_compatibility(project_data, binary_path)
        if not is_compatible:
            raise Exception(error_msg)
        
        # Initialize results tracking
        results = {
            "functions_applied": 0,
            "variables_applied": 0,
            "notes_applied": 0,
            "tags_applied": 0,
            "chat_sessions_restored": 0,
            "pseudocode_updated": 0,
            "success": True,
            "details": {}
        }
        
        customizations = project_data.get('customizations', {})
        
        # Apply function names and update pseudocode
        if customizations.get('function_names'):
            print(f"Applying {len(customizations['function_names'])} custom function names...")
            functions_applied, pseudocode_updated = ProjectService._apply_function_names_with_pseudocode(
                functions_data, customizations['function_names']
            )
            results["functions_applied"] = functions_applied
            results["pseudocode_updated"] += pseudocode_updated
            results["details"]["function_names"] = f"Applied {functions_applied} function names, updated {pseudocode_updated} pseudocode blocks"
        
        # Apply variable names and update pseudocode
        if customizations.get('variable_names'):
            print(f"Applying variable names for {len(customizations['variable_names'])} functions...")
            variables_applied, pseudocode_updated = ProjectService._apply_variable_names_with_pseudocode(
                functions_data, customizations['variable_names']
            )
            results["variables_applied"] = variables_applied
            results["pseudocode_updated"] += pseudocode_updated
            results["details"]["variable_names"] = f"Applied {variables_applied} variable names, updated {pseudocode_updated} pseudocode blocks"
        
        # Apply notes
        if customizations.get('notes'):
            print(f"Applying {len(customizations['notes'])} function notes...")
            notes_applied = await ProjectService._apply_notes(
                customizations['notes'], binary_name
            )
            results["notes_applied"] = notes_applied
            results["details"]["notes"] = f"Applied {notes_applied} notes"
        
        # Apply tags
        if customizations.get('tags'):
            print(f"Applying tags for {len(customizations['tags'])} functions...")
            tags_applied = await ProjectService._apply_tags(
                customizations['tags'], binary_name
            )
            results["tags_applied"] = tags_applied
            results["details"]["tags"] = f"Applied tags for {tags_applied} functions"
        
        # Restore chat sessions
        chat_history = project_data.get('chat_history', {})
        if chat_history.get('sessions'):
            print(f"Restoring {len(chat_history['sessions'])} chat sessions...")
            sessions_restored = await ProjectService._restore_chat_sessions(
                chat_history['sessions']
            )
            results["chat_sessions_restored"] = sessions_restored
            results["details"]["chat_sessions"] = f"Restored {sessions_restored} chat sessions"
        
        print("=== Complete Project Application Summary ===")
        print(f"Function names: {results['functions_applied']}")
        print(f"Variable names: {results['variables_applied']}")
        print(f"Notes: {results['notes_applied']}")
        print(f"Tags: {results['tags_applied']}")
        print(f"Chat sessions: {results['chat_sessions_restored']}")
        print(f"Pseudocode blocks updated: {results['pseudocode_updated']}")
        print("=== End Application Summary ===")
        
        return functions_data, results
    
    @staticmethod
    def _apply_function_names_with_pseudocode(
        functions_data: Dict, 
        function_names: Dict[str, str]
    ) -> Tuple[int, int]:
        """
        Apply custom function names and update pseudocode content.
        
        Returns:
            Tuple of (functions_applied, pseudocode_blocks_updated)
        """
        if not functions_data or 'functions' not in functions_data:
            return 0, 0
        
        functions_applied = 0
        pseudocode_updated = 0
        
        for func in functions_data['functions']:
            # Check if there's a custom name for this function's current name (original name)
            if function_names.get(func.get('name')):
                custom_name = function_names[func['name']]
                original_name = func['name']
                
                # Set the original name for tracking (if not already set)
                if not func.get('originalName'):
                    func['originalName'] = func['name']
                
                # Apply the custom name
                func['name'] = custom_name
                functions_applied += 1
                
                # Update pseudocode content to replace original name with custom name
                if func.get('pseudocode'):
                    try:
                        # Create a regex that matches the function name as a whole word
                        regex = re.compile(r'\b' + re.escape(original_name) + r'\b')
                        updated_pseudocode = regex.sub(custom_name, func['pseudocode'])
                        
                        if updated_pseudocode != func['pseudocode']:
                            func['pseudocode'] = updated_pseudocode
                            pseudocode_updated += 1
                            print(f"Updated pseudocode for function '{original_name}' -> '{custom_name}'")
                    except Exception as e:
                        print(f"Error updating pseudocode for function {original_name}: {e}")
                
                print(f"Applied function rename: '{func['originalName']}' -> '{func['name']}'")
        
        return functions_applied, pseudocode_updated
    
    @staticmethod
    def _apply_variable_names_with_pseudocode(
        functions_data: Dict, 
        variable_names: Dict[str, Dict[str, str]]
    ) -> Tuple[int, int]:
        """
        Apply custom variable names and update pseudocode content.
        
        Returns:
            Tuple of (variables_applied, pseudocode_blocks_updated)
        """
        if not functions_data or 'functions' not in functions_data:
            return 0, 0
        
        variables_applied = 0
        pseudocode_updated = 0
        
        for func in functions_data['functions']:
            if func['address'] in variable_names and func.get('local_variables'):
                func_var_names = variable_names[func['address']]
                function_pseudocode_updated = False
                updated_pseudocode = func.get('pseudocode', '')
                
                for variable in func['local_variables']:
                    # Check if there's a custom name for this variable's current name (original name)
                    if func_var_names.get(variable.get('name')):
                        custom_name = func_var_names[variable['name']]
                        original_name = variable['name']
                        
                        # Set the original name for tracking (if not already set)
                        if not variable.get('originalName'):
                            variable['originalName'] = variable['name']
                        
                        # Apply the custom name
                        variable['name'] = custom_name
                        variables_applied += 1
                        
                        # Update pseudocode content to replace original variable name with custom name
                        if updated_pseudocode:
                            try:
                                # Create a regex that matches the variable name as a whole word
                                regex = re.compile(r'\b' + re.escape(original_name) + r'\b')
                                new_pseudocode = regex.sub(custom_name, updated_pseudocode)
                                
                                if new_pseudocode != updated_pseudocode:
                                    updated_pseudocode = new_pseudocode
                                    function_pseudocode_updated = True
                                    print(f"Updated pseudocode for variable '{original_name}' -> '{custom_name}' in function {func['address']}")
                            except Exception as e:
                                print(f"Error updating pseudocode for variable {original_name}: {e}")
                        
                        print(f"Applied variable rename: '{variable['originalName']}' -> '{variable['name']}'")
                
                # If pseudocode was updated, apply it to the function
                if function_pseudocode_updated and updated_pseudocode != func.get('pseudocode'):
                    func['pseudocode'] = updated_pseudocode
                    pseudocode_updated += 1
        
        return variables_applied, pseudocode_updated
    
    @staticmethod
    async def _apply_notes(notes: Dict[str, str], binary_name: str) -> int:
        """Apply notes to functions via backend API."""
        clean_binary_name = ProjectService.clean_binary_name(
            ProjectService.get_binary_name_without_extension(binary_name)
        )
        
        applied_count = 0
        
        async with aiohttp.ClientSession() as session:
            for function_address, note_content in notes.items():
                try:
                    url = f"http://localhost:8000/api/notes/{clean_binary_name}/{function_address}"
                    async with session.post(
                        url,
                        json={"content": note_content},
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        if response.status == 200:
                            applied_count += 1
                            print(f"Successfully applied note for function {function_address}")
                        else:
                            print(f"Failed to apply note for function {function_address}: {response.status}")
                except Exception as e:
                    print(f"Error applying note for function {function_address}: {e}")
        
        return applied_count
    
    @staticmethod
    async def _apply_tags(tags: Dict[str, List], binary_name: str) -> int:
        """Apply tags to functions via backend API."""
        clean_binary_name = ProjectService.clean_binary_name(
            ProjectService.get_binary_name_without_extension(binary_name)
        )
        
        applied_count = 0
        
        async with aiohttp.ClientSession() as session:
            for function_address, function_tags in tags.items():
                try:
                    url = f"http://localhost:8000/api/tags/{clean_binary_name}/{function_address}"
                    async with session.post(
                        url,
                        json={"tags": function_tags},
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        if response.status == 200:
                            applied_count += 1
                            print(f"Successfully applied tags for function {function_address}")
                        else:
                            print(f"Failed to apply tags for function {function_address}: {response.status}")
                except Exception as e:
                    print(f"Error applying tags for function {function_address}: {e}")
        
        return applied_count
    
    @staticmethod
    async def _restore_chat_sessions(sessions: List[Dict]) -> int:
        """Restore chat sessions via backend API."""
        if not sessions:
            return 0
        
        restored_count = 0
        
        async with aiohttp.ClientSession() as session_client:
            for session_data in sessions:
                try:
                    url = "http://localhost:8000/api/chat/restore"
                    async with session_client.post(
                        url,
                        json={
                            "session_id": session_data.get("session_id"),
                            "name": session_data.get("name"),
                            "created_at": session_data.get("created_at"),
                            "last_activity": session_data.get("last_activity"),
                            "messages": session_data.get("messages", [])
                        },
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        if response.status == 200:
                            restored_count += 1
                            print(f"✓ Restored session: {session_data.get('session_id')}")
                        else:
                            print(f"✗ Failed to restore session {session_data.get('session_id')}: {response.status}")
                except Exception as e:
                    print(f"✗ Error restoring session {session_data.get('session_id')}: {e}")
        
        return restored_count 