#!/usr/bin/env python3
"""
API endpoints for project service.
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

from backend.services.project_service import ProjectService

router = APIRouter(prefix="/api/projects")

class ProjectDataRequest(BaseModel):
    project_name: Optional[str] = None
    binary_name: str
    binary_path: str
    functions_data: Dict[str, Any]

class ProjectCompatibilityRequest(BaseModel):
    project_data: Dict[str, Any]
    current_binary_path: str

class ApplyCustomizationsRequest(BaseModel):
    functions_data: Dict[str, Any]
    function_names: Optional[Dict[str, str]] = None
    variable_names: Optional[Dict[str, Dict[str, str]]] = None

class ProjectDataResponse(BaseModel):
    project_data: Dict[str, Any]

class CompatibilityResponse(BaseModel):
    is_compatible: bool
    error_message: Optional[str] = None

class ApplyResponse(BaseModel):
    functions_applied: int
    variables_applied: int

class HashResponse(BaseModel):
    hash: str

@router.post("/collect-data", response_model=ProjectDataResponse)
async def collect_project_data(request: ProjectDataRequest):
    """Collect all project data for saving."""
    try:
        project_data = await ProjectService.collect_project_data(
            request.project_name,
            request.binary_name,
            request.binary_path,
            request.functions_data
        )
        
        return ProjectDataResponse(project_data=project_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-compatibility", response_model=CompatibilityResponse)
async def verify_project_compatibility(request: ProjectCompatibilityRequest):
    """Verify that a project file is compatible with the current binary."""
    try:
        is_compatible, error = ProjectService.verify_project_compatibility(
            request.project_data,
            request.current_binary_path
        )
        
        return CompatibilityResponse(is_compatible=is_compatible, error_message=error)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/apply-customizations", response_model=ApplyResponse)
async def apply_customizations(request: ApplyCustomizationsRequest):
    """Apply customizations to functions data."""
    try:
        functions_applied = 0
        variables_applied = 0
        
        if request.function_names:
            functions_applied = ProjectService.apply_custom_function_names(
                request.functions_data,
                request.function_names
            )
        
        if request.variable_names:
            variables_applied = ProjectService.apply_custom_variable_names(
                request.functions_data,
                request.variable_names
            )
        
        return ApplyResponse(
            functions_applied=functions_applied,
            variables_applied=variables_applied
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/calculate-hash", response_model=HashResponse)
async def calculate_binary_hash(file_path: str = Body(..., embed=True)):
    """Calculate SHA256 hash of a binary file."""
    try:
        hash_value = ProjectService.calculate_binary_hash(file_path)
        return HashResponse(hash=hash_value)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clean-name")
async def clean_binary_name(name: str = Body(..., embed=True)):
    """Clean binary name for filesystem compatibility."""
    try:
        cleaned_name = ProjectService.clean_binary_name(name)
        return {"cleaned_name": cleaned_name}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collect-function-names")
async def collect_custom_function_names(functions_data: Dict[str, Any] = Body(...)):
    """Collect custom function names from functions data."""
    try:
        custom_names = ProjectService.collect_custom_function_names(functions_data)
        return {"function_names": custom_names}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collect-variable-names")
async def collect_custom_variable_names(functions_data: Dict[str, Any] = Body(...)):
    """Collect custom variable names from functions data."""
    try:
        variable_names = ProjectService.collect_custom_variable_names(functions_data)
        return {"variable_names": variable_names}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 