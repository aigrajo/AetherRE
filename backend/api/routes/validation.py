#!/usr/bin/env python3
"""
API endpoints for validation service.
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel
import logging

from backend.services.validation_service import ValidationService

router = APIRouter(prefix="/api/validation")

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class FunctionValidationRequest(BaseModel):
    old_name: str
    new_name: str
    functions_data: Dict[str, Any]
    current_function_id: str
    pseudocode: Optional[str] = None

class VariableValidationRequest(BaseModel):
    old_name: str
    new_name: str
    local_variables: List[Dict[str, Any]]
    pseudocode: Optional[str] = None

class TagValidationRequest(BaseModel):
    tag_value: str
    tag_type: str
    existing_tags: List[Dict[str, Any]]

class BatchFunctionValidationRequest(BaseModel):
    rename_operations: List[Dict[str, Any]]  # Each with old_name, new_name, function_id, pseudocode
    functions_data: Dict[str, Any]

class BatchVariableValidationRequest(BaseModel):
    rename_operations: List[Dict[str, Any]]  # Each with old_name, new_name, pseudocode
    local_variables: List[Dict[str, Any]]

class ValidationResponse(BaseModel):
    is_valid: bool
    error_message: Optional[str] = None

class BatchValidationResponse(BaseModel):
    results: List[ValidationResponse]
    overall_valid: bool

@router.post("/function-name", response_model=ValidationResponse)
async def validate_function_name(request: FunctionValidationRequest):
    """Validate a function name change."""
    try:
        logger.debug(f"Function validation request: {request}")
        logger.debug(f"Functions data keys: {list(request.functions_data.keys()) if request.functions_data else 'None'}")
        
        is_valid, error = ValidationService.validate_function_name(
            request.old_name,
            request.new_name,
            request.functions_data,
            request.current_function_id,
            request.pseudocode
        )
        
        logger.debug(f"Validation result: is_valid={is_valid}, error={error}")
        
        return ValidationResponse(is_valid=is_valid, error_message=error)
        
    except Exception as e:
        logger.error(f"Error in function validation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/variable-name", response_model=ValidationResponse)
async def validate_variable_name(request: VariableValidationRequest):
    """Validate a variable name change."""
    try:
        logger.debug(f"Variable validation request: {request}")
        
        is_valid, error = ValidationService.validate_variable_name(
            request.old_name,
            request.new_name,
            request.local_variables,
            request.pseudocode
        )
        
        logger.debug(f"Validation result: is_valid={is_valid}, error={error}")
        
        return ValidationResponse(is_valid=is_valid, error_message=error)
        
    except Exception as e:
        logger.error(f"Error in variable validation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tag-value", response_model=ValidationResponse)
async def validate_tag_value(request: TagValidationRequest):
    """Validate a tag value."""
    try:
        is_valid, error = ValidationService.validate_tag_value(
            request.tag_value,
            request.tag_type,
            request.existing_tags
        )
        
        return ValidationResponse(is_valid=is_valid, error_message=error)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/name-format", response_model=ValidationResponse)
async def validate_name_format(name: str = Body(..., embed=True)):
    """Validate basic name format."""
    try:
        is_valid, error = ValidationService.validate_name_format(name)
        return ValidationResponse(is_valid=is_valid, error_message=error)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/keywords", response_model=ValidationResponse)
async def validate_against_keywords(name: str = Body(..., embed=True)):
    """Validate that name is not a reserved keyword."""
    try:
        is_valid, error = ValidationService.validate_against_keywords(name)
        return ValidationResponse(is_valid=is_valid, error_message=error)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pseudocode-conflicts", response_model=ValidationResponse)
async def validate_pseudocode_conflicts(
    name: str = Body(...),
    pseudocode: Optional[str] = Body(None),
    old_name: Optional[str] = Body(None)
):
    """Validate that a name doesn't conflict with pseudocode."""
    try:
        is_valid, error = ValidationService.validate_pseudocode_conflicts(name, pseudocode, old_name)
        return ValidationResponse(is_valid=is_valid, error_message=error)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch/function-names", response_model=BatchValidationResponse)
async def batch_validate_function_names(request: BatchFunctionValidationRequest):
    """Batch validate multiple function name changes."""
    try:
        logger.debug(f"Batch function validation request: {len(request.rename_operations)} operations")
        
        results = ValidationService.batch_validate_function_names(
            request.rename_operations,
            request.functions_data
        )
        
        # Convert results to response format
        validation_responses = [
            ValidationResponse(is_valid=is_valid, error_message=error)
            for is_valid, error in results
        ]
        
        overall_valid = all(result.is_valid for result in validation_responses)
        
        logger.debug(f"Batch validation results: {len(validation_responses)} results, overall_valid={overall_valid}")
        
        return BatchValidationResponse(results=validation_responses, overall_valid=overall_valid)
        
    except Exception as e:
        logger.error(f"Error in batch function validation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch/variable-names", response_model=BatchValidationResponse)
async def batch_validate_variable_names(request: BatchVariableValidationRequest):
    """Batch validate multiple variable name changes."""
    try:
        logger.debug(f"Batch variable validation request: {len(request.rename_operations)} operations")
        
        results = ValidationService.batch_validate_variable_names(
            request.rename_operations,
            request.local_variables
        )
        
        # Convert results to response format
        validation_responses = [
            ValidationResponse(is_valid=is_valid, error_message=error)
            for is_valid, error in results
        ]
        
        overall_valid = all(result.is_valid for result in validation_responses)
        
        logger.debug(f"Batch validation results: {len(validation_responses)} results, overall_valid={overall_valid}")
        
        return BatchValidationResponse(results=validation_responses, overall_valid=overall_valid)
        
    except Exception as e:
        logger.error(f"Error in batch variable validation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 