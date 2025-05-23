#!/usr/bin/env python3
"""
API endpoints for tag service.
Enhanced to use the new TagService backend logic.
"""

from fastapi import APIRouter, HTTPException, Path, Body
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

from backend.services.tag_service import TagService

router = APIRouter(prefix="/api")
tag_service = TagService()

# Pydantic models
class TagCreateRequest(BaseModel):
    tag_type: str
    tag_value: str
    color: Optional[str] = None
    include_in_ai: bool = True

class TagToggleRequest(BaseModel):
    tag_type: str
    tag_value: str

class TagResponse(BaseModel):
    success: bool
    message: Optional[str] = None

class TagsResponse(BaseModel):
    tags: List[Dict[str, Any]]

class TagTypesResponse(BaseModel):
    tag_types: Dict[str, Dict[str, Any]]

class TagColorsResponse(BaseModel):
    colors: List[str]

class GroupedTagsResponse(BaseModel):
    grouped_tags: Dict[str, List[Dict[str, Any]]]

# Existing endpoints (updated to use TagService)
@router.get("/tags/{binary}/{function_id}", response_model=TagsResponse)
async def get_tags(binary: str, function_id: str):
    """Get tags for a specific function in a binary"""
    try:
        tags = tag_service.get_tags(binary, function_id)
        return TagsResponse(tags=tags)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading tags: {str(e)}")

@router.post("/tags/{binary}/{function_id}", response_model=TagResponse)
async def save_tags(binary: str, function_id: str, data: Dict[str, List[Dict[str, Any]]] = Body(...)):
    """Save tags for a specific function in a binary"""
    try:
        tags = data.get("tags", [])
        tag_service.save_tags(binary, function_id, tags)
        return TagResponse(success=True, message="Tags saved successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving tags: {str(e)}")

# New enhanced endpoints
@router.post("/tags/{binary}/{function_id}/add", response_model=TagResponse)
async def add_tag(binary: str, function_id: str, request: TagCreateRequest):
    """Add a new tag to a function"""
    try:
        success, error = tag_service.add_tag(
            binary, 
            function_id, 
            request.tag_type,
            request.tag_value,
            request.color,
            request.include_in_ai
        )
        
        if success:
            return TagResponse(success=True, message="Tag added successfully")
        else:
            return TagResponse(success=False, message=error)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding tag: {str(e)}")

@router.delete("/tags/{binary}/{function_id}/remove", response_model=TagResponse)
async def remove_tag(binary: str, function_id: str, request: TagToggleRequest):
    """Remove a tag from a function"""
    try:
        success, error = tag_service.remove_tag(
            binary,
            function_id,
            request.tag_type,
            request.tag_value
        )
        
        if success:
            return TagResponse(success=True, message="Tag removed successfully")
        else:
            return TagResponse(success=False, message=error)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing tag: {str(e)}")

@router.post("/tags/{binary}/{function_id}/toggle-ai", response_model=TagResponse)
async def toggle_ai_inclusion(binary: str, function_id: str, request: TagToggleRequest):
    """Toggle the AI inclusion flag for a tag"""
    try:
        success, error = tag_service.toggle_ai_inclusion(
            binary,
            function_id,
            request.tag_type,
            request.tag_value
        )
        
        if success:
            return TagResponse(success=True, message="AI inclusion toggled successfully")
        else:
            return TagResponse(success=False, message=error)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error toggling AI inclusion: {str(e)}")

@router.get("/tags/{binary}/{function_id}/ai-context")
async def get_ai_context_tags(binary: str, function_id: str):
    """Get tags that should be included in AI context"""
    try:
        ai_tags = tag_service.get_ai_context_tags(binary, function_id)
        return {"tags": ai_tags}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting AI context tags: {str(e)}")

@router.get("/tags/{binary}/{function_id}/grouped", response_model=GroupedTagsResponse)
async def get_grouped_tags(binary: str, function_id: str):
    """Get tags grouped by type"""
    try:
        tags = tag_service.get_tags(binary, function_id)
        grouped_tags = tag_service.group_tags_by_type(tags)
        return GroupedTagsResponse(grouped_tags=grouped_tags)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error grouping tags: {str(e)}")

@router.get("/tags/types", response_model=TagTypesResponse)
async def get_tag_types():
    """Get available tag types and their descriptions"""
    try:
        tag_types = TagService.get_tag_types()
        return TagTypesResponse(tag_types=tag_types)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting tag types: {str(e)}")

@router.get("/tags/colors", response_model=TagColorsResponse)
async def get_tag_colors():
    """Get available tag colors"""
    try:
        colors = TagService.get_tag_colors()
        return TagColorsResponse(colors=colors)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting tag colors: {str(e)}")

@router.post("/tags/{binary}/cleanup", response_model=TagResponse)
async def cleanup_metadata(binary: str):
    """Clean up all tags files for a specific binary"""
    try:
        success, message = tag_service.cleanup_tags(binary)
        return TagResponse(success=success, message=message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cleaning up tags: {str(e)}") 