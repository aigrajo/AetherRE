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

class BatchApplyRequest(BaseModel):
    functions_data: Dict[str, Any]
    customizations: Dict[str, Any]  # Can include function_names, variable_names, notes, tags

class ProjectDataResponse(BaseModel):
    project_data: Dict[str, Any]

class CompatibilityResponse(BaseModel):
    is_compatible: bool
    error_message: Optional[str] = None

class ApplyResponse(BaseModel):
    functions_applied: int
    variables_applied: int

class BatchApplyResponse(BaseModel):
    functions_applied: int
    variables_applied: int
    notes_applied: int
    tags_applied: int
    success: bool
    details: Dict[str, Any]

class HashResponse(BaseModel):
    hash: str

class CollectionResponse(BaseModel):
    function_names: Dict[str, str]

class VariableCollectionResponse(BaseModel):
    variable_names: Dict[str, Dict[str, str]]

class ProjectStateRequest(BaseModel):
    binary_name: str
    functions_data: Dict[str, Any]

class ProjectStateResponse(BaseModel):
    state: Dict[str, Any]
    metadata: Dict[str, Any]

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

@router.post("/batch-apply", response_model=BatchApplyResponse)
async def batch_apply_customizations(request: BatchApplyRequest):
    """Apply all types of customizations in a single batch operation."""
    try:
        functions_applied = 0
        variables_applied = 0
        notes_applied = 0
        tags_applied = 0
        details = {}
        
        customizations = request.customizations
        
        # Apply function names
        if customizations.get('function_names'):
            functions_applied = ProjectService.apply_custom_function_names(
                request.functions_data,
                customizations['function_names']
            )
            details['function_names'] = f"Applied {functions_applied} function names"
        
        # Apply variable names
        if customizations.get('variable_names'):
            variables_applied = ProjectService.apply_custom_variable_names(
                request.functions_data,
                customizations['variable_names']
            )
            details['variable_names'] = f"Applied {variables_applied} variable names"
        
        # Apply notes (would integrate with notes service)
        if customizations.get('notes'):
            # This would need integration with notes service
            notes_count = len(customizations['notes'])
            details['notes'] = f"Would apply {notes_count} notes (integration needed)"
            
        # Apply tags (would integrate with tags service)
        if customizations.get('tags'):
            # This would need integration with tags service
            tags_count = sum(len(tag_list) for tag_list in customizations['tags'].values())
            details['tags'] = f"Would apply {tags_count} tags (integration needed)"
        
        return BatchApplyResponse(
            functions_applied=functions_applied,
            variables_applied=variables_applied,
            notes_applied=notes_applied,
            tags_applied=tags_applied,
            success=True,
            details=details
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

@router.post("/collect-function-names", response_model=CollectionResponse)
async def collect_custom_function_names(functions_data: Dict[str, Any] = Body(...)):
    """Collect custom function names from functions data."""
    try:
        custom_names = ProjectService.collect_custom_function_names(functions_data)
        return CollectionResponse(function_names=custom_names)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collect-variable-names", response_model=VariableCollectionResponse)
async def collect_custom_variable_names(functions_data: Dict[str, Any] = Body(...)):
    """Collect custom variable names from functions data."""
    try:
        variable_names = ProjectService.collect_custom_variable_names(functions_data)
        return VariableCollectionResponse(variable_names=variable_names)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/state/current", response_model=ProjectStateResponse)
async def get_current_project_state(request: ProjectStateRequest):
    """Get the current project state including all customizations."""
    try:
        binary_name = request.binary_name
        functions_data = request.functions_data
        
        # Collect current state
        function_names = ProjectService.collect_custom_function_names(functions_data)
        variable_names = ProjectService.collect_custom_variable_names(functions_data)
        
        # Get clean binary name for metadata operations
        clean_binary_name = ProjectService.clean_binary_name(
            ProjectService.get_binary_name_without_extension(binary_name)
        )
        
        # Collect notes and tags
        notes = await ProjectService.collect_all_notes(clean_binary_name, functions_data)
        tags = await ProjectService.collect_all_tags(clean_binary_name, functions_data)
        chat_sessions = ProjectService.collect_chat_sessions()
        
        state = {
            "function_names": function_names,
            "variable_names": variable_names,
            "notes": notes,
            "tags": tags,
            "chat_sessions": chat_sessions
        }
        
        metadata = {
            "binary_name": binary_name,
            "clean_binary_name": clean_binary_name,
            "function_count": len(functions_data.get('functions', [])),
            "customization_counts": {
                "function_names": len(function_names),
                "variable_names": len(variable_names),
                "notes": len(notes),
                "tags": len(tags),
                "chat_sessions": len(chat_sessions)
            }
        }
        
        return ProjectStateResponse(state=state, metadata=metadata)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/state/validate")
async def validate_project_state(request: ProjectStateRequest):
    """Validate the integrity of the current project state."""
    try:
        functions_data = request.functions_data
        validation_results = {}
        
        # Validate function names
        if functions_data and 'functions' in functions_data:
            function_issues = []
            for func in functions_data['functions']:
                if not func.get('address'):
                    function_issues.append("Function missing address")
                if not func.get('name'):
                    function_issues.append(f"Function at {func.get('address', 'unknown')} missing name")
            
            validation_results['functions'] = {
                'count': len(functions_data['functions']),
                'issues': function_issues
            }
        
        # Validate variable data integrity
        variable_issues = []
        for func in functions_data.get('functions', []):
            if func.get('local_variables'):
                for var in func['local_variables']:
                    if not var.get('name'):
                        variable_issues.append(f"Variable in function {func.get('address')} missing name")
                    if var.get('originalName') and var.get('name') == var.get('originalName'):
                        variable_issues.append(f"Variable {var.get('name')} has redundant originalName tracking")
        
        validation_results['variables'] = {
            'issues': variable_issues
        }
        
        validation_results['overall_valid'] = (
            len(validation_results['functions']['issues']) == 0 and
            len(validation_results['variables']['issues']) == 0
        )
        
        return {
            "validation_results": validation_results,
            "is_valid": validation_results['overall_valid']
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 