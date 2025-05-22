import os
import json
from pathlib import Path
from typing import Dict, List, Optional, Any

# Ensure the notes directory exists
notes_dir = Path("notes")
data_dir = Path("data")
notes_dir.mkdir(exist_ok=True)
data_dir.mkdir(exist_ok=True)

def get_note(binary: str, function_id: str) -> str:
    """
    Read the note content for a specific function
    
    Args:
        binary: Name of the binary
        function_id: Function identifier (e.g., address)
        
    Returns:
        The note content as a string
    """
    note_path = notes_dir / f"{binary}_{function_id}_note.txt"
    
    if not note_path.exists():
        return ""
        
    try:
        with open(note_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        raise Exception(f"Error reading note: {str(e)}")

def save_note(binary: str, function_id: str, content: str) -> None:
    """
    Save note content for a specific function
    
    Args:
        binary: Name of the binary
        function_id: Function identifier (e.g., address)
        content: The note content to save
    """
    note_path = notes_dir / f"{binary}_{function_id}_note.txt"
    
    try:
        with open(note_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        raise Exception(f"Error saving note: {str(e)}")

def get_tags(binary: str, function_id: str) -> List[Dict[str, Any]]:
    """
    Get tags for a specific function
    
    Args:
        binary: Name of the binary
        function_id: Function identifier (e.g., address)
        
    Returns:
        A list of tag objects
    """
    tags_file = data_dir / f"{binary}_function_tags.json"
    
    if not tags_file.exists():
        return []
        
    try:
        with open(tags_file, "r", encoding="utf-8") as f:
            all_tags = json.load(f)
        
        # Get tags for the specific function or return empty list
        return all_tags.get(function_id, [])
    except Exception as e:
        raise Exception(f"Error reading tags: {str(e)}")

def save_tags(binary: str, function_id: str, tags: List[Dict[str, Any]]) -> None:
    """
    Save tags for a specific function
    
    Args:
        binary: Name of the binary
        function_id: Function identifier (e.g., address)
        tags: List of tag objects to save
    """
    tags_file = data_dir / f"{binary}_function_tags.json"
    
    try:
        # Load existing tags or create new if file doesn't exist
        all_tags = {}
        if tags_file.exists():
            with open(tags_file, "r", encoding="utf-8") as f:
                all_tags = json.load(f)
        
        # Update tags for this function
        all_tags[function_id] = tags
        
        # Save all tags back to file
        with open(tags_file, "w", encoding="utf-8") as f:
            json.dump(all_tags, f, indent=2)
    except Exception as e:
        raise Exception(f"Error saving tags: {str(e)}")

def get_tag_types() -> Dict[str, str]:
    """
    Get available tag types and their descriptions
    
    Returns:
        Dictionary of tag types with descriptions
    """
    return {
        "Behavioral": "Describes what the function does (e.g., decryptor, c2_handler)",
        "Structural": "Describes how the function fits into the program architecture (e.g., entrypoint, helper_function)",
        "Workflow": "Describes the analyst's workflow state (e.g., needs_review, suspicious)"
    } 