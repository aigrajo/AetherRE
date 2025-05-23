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

class ValidationResponse(BaseModel):
    is_valid: bool
    error_message: Optional[str] = None

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