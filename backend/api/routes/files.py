#!/usr/bin/env python3
"""
API endpoints for file service.
Handles file validation, type detection, and path processing.
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, Optional
from pydantic import BaseModel

from backend.services.file_service import FileService

router = APIRouter(prefix="/api/files")

# Pydantic models
class FileTypeRequest(BaseModel):
    file_path: str

class FileTypeResponse(BaseModel):
    is_valid: bool
    file_type: str
    extension: str
    filename: str
    size: int
    suggested_action: str
    error: Optional[str] = None

class FilenameExtractionRequest(BaseModel):
    file_path: str

class FilenameExtractionResponse(BaseModel):
    filename: str

class BinaryNameSanitizationRequest(BaseModel):
    binary_name: str

class BinaryNameSanitizationResponse(BaseModel):
    sanitized_name: str

class DefaultFilenameRequest(BaseModel):
    binary_name: str

class DefaultFilenameResponse(BaseModel):
    default_filename: str

class BinaryNameExtractionRequest(BaseModel):
    analysis_data: Dict[str, Any]
    fallback_filename: str

class BinaryNameExtractionResponse(BaseModel):
    binary_name: str

class FileValidationRequest(BaseModel):
    file_path: str

class FileValidationResponse(BaseModel):
    is_valid: bool
    error_message: str

class FileInfoRequest(BaseModel):
    file_path: str

class FileInfoResponse(BaseModel):
    path: str
    filename: str
    stem: str
    extension: str
    size: int
    size_mb: float
    modified: float
    exists: bool
    is_file: bool
    is_readable: bool
    error: Optional[str] = None

class FileHashRequest(BaseModel):
    file_path: str

class FileHashResponse(BaseModel):
    hash: str

class TempCleanupRequest(BaseModel):
    pattern: str

class TempCleanupResponse(BaseModel):
    deleted_count: int

class RemoveExtensionRequest(BaseModel):
    filename: str

class RemoveExtensionResponse(BaseModel):
    stem: str

# API endpoints
@router.post("/detect-type", response_model=FileTypeResponse)
async def detect_file_type(request: FileTypeRequest):
    """Detect file type and return comprehensive file information."""
    try:
        result = FileService.detect_file_type(request.file_path)
        return FileTypeResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error detecting file type: {str(e)}")

@router.post("/extract-filename", response_model=FilenameExtractionResponse)
async def extract_filename(request: FilenameExtractionRequest):
    """Extract filename from file path."""
    try:
        filename = FileService.extract_filename(request.file_path)
        return FilenameExtractionResponse(filename=filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting filename: {str(e)}")

@router.post("/sanitize-binary-name", response_model=BinaryNameSanitizationResponse)
async def sanitize_binary_name(request: BinaryNameSanitizationRequest):
    """Sanitize binary name for safe use in filenames."""
    try:
        sanitized = FileService.sanitize_binary_name(request.binary_name)
        return BinaryNameSanitizationResponse(sanitized_name=sanitized)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sanitizing binary name: {str(e)}")

@router.post("/generate-default-filename", response_model=DefaultFilenameResponse)
async def generate_default_filename(request: DefaultFilenameRequest):
    """Generate default project filename based on binary name."""
    try:
        default_filename = FileService.generate_default_project_filename(request.binary_name)
        return DefaultFilenameResponse(default_filename=default_filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating default filename: {str(e)}")

@router.post("/extract-binary-name", response_model=BinaryNameExtractionResponse)
async def extract_binary_name_from_analysis(request: BinaryNameExtractionRequest):
    """Extract original binary name from analysis data."""
    try:
        binary_name = FileService.extract_binary_name_from_analysis(
            request.analysis_data, 
            request.fallback_filename
        )
        return BinaryNameExtractionResponse(binary_name=binary_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting binary name: {str(e)}")

@router.post("/validate-path", response_model=FileValidationResponse)
async def validate_file_path(request: FileValidationRequest):
    """Validate that a file path exists and is accessible."""
    try:
        is_valid, error_message = FileService.validate_file_path(request.file_path)
        return FileValidationResponse(is_valid=is_valid, error_message=error_message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating file path: {str(e)}")

@router.post("/get-info", response_model=FileInfoResponse)
async def get_file_info(request: FileInfoRequest):
    """Get comprehensive file information."""
    try:
        info = FileService.get_file_info(request.file_path)
        return FileInfoResponse(**info)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting file info: {str(e)}")

@router.post("/calculate-hash", response_model=FileHashResponse)
async def calculate_file_hash(request: FileHashRequest):
    """Calculate SHA256 hash of a file."""
    try:
        hash_value = FileService.calculate_file_hash(request.file_path)
        return FileHashResponse(hash=hash_value)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating file hash: {str(e)}")

@router.post("/cleanup-temp", response_model=TempCleanupResponse)
async def cleanup_temp_files(request: TempCleanupRequest):
    """Clean up temporary files matching a pattern."""
    try:
        deleted_count = FileService.cleanup_temp_files(request.pattern)
        return TempCleanupResponse(deleted_count=deleted_count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cleaning up temp files: {str(e)}")

# Convenience endpoints for common operations
@router.post("/remove-extension", response_model=RemoveExtensionResponse)
async def remove_extension(request: RemoveExtensionRequest):
    """Remove file extension from filename."""
    try:
        stem = FileService.remove_extension(request.filename)
        return RemoveExtensionResponse(stem=stem)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing extension: {str(e)}")

@router.post("/is-binary")
async def check_if_binary(file_path: str = Body(..., embed=True)):
    """Quick check if file is a binary based on extension and content."""
    try:
        file_info = FileService.detect_file_type(file_path)
        is_binary = file_info["file_type"] == "binary"
        return {"is_binary": is_binary, "file_type": file_info["file_type"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking file type: {str(e)}")

@router.post("/is-json-analysis")
async def check_if_json_analysis(file_path: str = Body(..., embed=True)):
    """Quick check if file is a JSON analysis file."""
    try:
        file_info = FileService.detect_file_type(file_path)
        is_json_analysis = file_info["file_type"] == "json_analysis"
        return {"is_json_analysis": is_json_analysis, "file_type": file_info["file_type"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking file type: {str(e)}")

@router.post("/is-project")
async def check_if_project(file_path: str = Body(..., embed=True)):
    """Quick check if file is a project file."""
    try:
        file_info = FileService.detect_file_type(file_path)
        is_project = file_info["file_type"] == "project"
        return {"is_project": is_project, "file_type": file_info["file_type"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking file type: {str(e)}") 