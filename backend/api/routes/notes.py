from fastapi import APIRouter, HTTPException, Path, Body
from typing import Dict, List, Optional, Any
import os
import json
from pathlib import Path as FilePath

router = APIRouter()

# Ensure the notes directory exists
notes_dir = FilePath("notes")
data_dir = FilePath("data")
notes_dir.mkdir(exist_ok=True)
data_dir.mkdir(exist_ok=True)

# Notes API endpoints
@router.get("/notes/{binary}/{function_id}")
async def get_note(binary: str, function_id: str):
    """Get a note for a specific function in a binary"""
    note_path = notes_dir / f"{binary}_{function_id}_note.txt"
    
    if not note_path.exists():
        return {"content": ""}
        
    try:
        with open(note_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading note: {str(e)}")

@router.post("/notes/{binary}/{function_id}")
async def save_note(binary: str, function_id: str, data: Dict[str, str] = Body(...)):
    """Save a note for a specific function in a binary"""
    content = data.get("content", "")
    note_path = notes_dir / f"{binary}_{function_id}_note.txt"
    
    try:
        with open(note_path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"status": "success", "message": "Note saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving note: {str(e)}")

# Tags API endpoints
@router.get("/tags/{binary}/{function_id}")
async def get_tags(binary: str, function_id: str):
    """Get tags for a specific function in a binary"""
    tags_file = data_dir / f"{binary}_function_tags.json"
    
    if not tags_file.exists():
        return {"tags": []}
        
    try:
        with open(tags_file, "r", encoding="utf-8") as f:
            all_tags = json.load(f)
        
        # Get tags for the specific function or return empty list
        function_tags = all_tags.get(function_id, [])
        return {"tags": function_tags}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading tags: {str(e)}")

@router.post("/tags/{binary}/{function_id}")
async def save_tags(binary: str, function_id: str, data: Dict[str, List[Dict[str, Any]]] = Body(...)):
    """Save tags for a specific function in a binary"""
    tags = data.get("tags", [])
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
            
        return {"status": "success", "message": "Tags saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving tags: {str(e)}")

@router.get("/tags/{binary}/types")
async def get_tag_types():
    """Get available tag types and their descriptions"""
    tag_types = {
        "Behavioral": "Describes what the function does (e.g., decryptor, c2_handler)",
        "Structural": "Describes how the function fits into the program architecture (e.g., entrypoint, helper_function)",
        "Workflow": "Describes the analyst's workflow state (e.g., needs_review, suspicious)"
    }
    return {"tag_types": tag_types} 