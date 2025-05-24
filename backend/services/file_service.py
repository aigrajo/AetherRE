#!/usr/bin/env python3
"""
File service for handling file operations, validation, and processing.
This service consolidates all file-related business logic that was previously in the frontend.
"""

import os
import re
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
import json
import logging

logger = logging.getLogger(__name__)

class FileService:
    """Service for file operations and validation."""
    
    # Supported file extensions
    BINARY_EXTENSIONS = {'.exe', '.dll', '.so', '.dylib', '.bin', '.elf', '.o', '.a'}
    JSON_EXTENSIONS = {'.json'}
    PROJECT_EXTENSIONS = {'.aetherre'}
    
    @staticmethod
    def detect_file_type(file_path: str) -> Dict[str, Any]:
        """
        Detect file type and return comprehensive file information.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Dict containing file type, validity, metadata, and processing suggestions
        """
        try:
            path = Path(file_path)
            if not path.exists():
                return {
                    "is_valid": False,
                    "file_type": "unknown",
                    "error": "File does not exist",
                    "extension": "",
                    "filename": "",
                    "size": 0
                }
            
            extension = path.suffix.lower()
            filename = path.name
            file_size = path.stat().st_size
            
            # Determine file type based on extension
            if extension in FileService.BINARY_EXTENSIONS:
                file_type = "binary"
                is_valid = True
                suggested_action = "analyze_binary"
            elif extension in FileService.JSON_EXTENSIONS:
                file_type = "json_analysis"
                is_valid = FileService._validate_json_file(file_path)
                suggested_action = "load_analysis" if is_valid else "invalid"
            elif extension in FileService.PROJECT_EXTENSIONS:
                file_type = "project"
                is_valid = FileService._validate_project_file(file_path)
                suggested_action = "load_project" if is_valid else "invalid"
            else:
                # Try to detect by content for files without extensions
                content_type = FileService._detect_by_content(file_path)
                if content_type:
                    file_type = content_type
                    is_valid = True
                    suggested_action = "analyze_binary" if content_type == "binary" else "load_analysis"
                else:
                    file_type = "unknown"
                    is_valid = False
                    suggested_action = "unsupported"
            
            return {
                "is_valid": is_valid,
                "file_type": file_type,
                "extension": extension,
                "filename": filename,
                "size": file_size,
                "suggested_action": suggested_action,
                "error": None if is_valid else f"Unsupported file type: {extension}"
            }
            
        except Exception as e:
            logger.error(f"Error detecting file type for {file_path}: {str(e)}")
            return {
                "is_valid": False,
                "file_type": "unknown",
                "error": f"Error analyzing file: {str(e)}",
                "extension": "",
                "filename": "",
                "size": 0
            }
    
    @staticmethod
    def _validate_json_file(file_path: str) -> bool:
        """Validate that a JSON file contains valid analysis data."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Check for required fields in analysis JSON
            if isinstance(data, dict):
                # Look for common analysis data structures
                has_functions = 'functions' in data
                has_metadata = 'metadata' in data
                return has_functions or has_metadata
            elif isinstance(data, list):
                # List of functions
                return len(data) > 0 and isinstance(data[0], dict)
            
            return False
        except Exception:
            return False
    
    @staticmethod
    def _validate_project_file(file_path: str) -> bool:
        """Validate that a project file contains valid project data."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Check for required project structure
            return (isinstance(data, dict) and 
                   'aetherre_project' in data and
                   isinstance(data['aetherre_project'], dict))
        except Exception:
            return False
    
    @staticmethod
    def _detect_by_content(file_path: str) -> Optional[str]:
        """Detect file type by examining file content."""
        try:
            with open(file_path, 'rb') as f:
                header = f.read(16)
            
            # Check for common binary file signatures
            if header.startswith(b'MZ'):  # Windows PE
                return "binary"
            elif header.startswith(b'\x7fELF'):  # Linux ELF
                return "binary"
            elif header[:4] in [b'\xfe\xed\xfa\xce', b'\xfe\xed\xfa\xcf', 
                               b'\xce\xfa\xed\xfe', b'\xcf\xfa\xed\xfe']:  # Mach-O
                return "binary"
            
            # Try to parse as JSON
            try:
                f.seek(0)
                content = f.read().decode('utf-8')
                json.loads(content)
                return "json_analysis"
            except:
                pass
            
            return None
        except Exception:
            return None
    
    @staticmethod
    def extract_filename(file_path: str) -> str:
        """
        Extract filename from file path in a cross-platform way.
        
        Args:
            file_path: Full path to the file
            
        Returns:
            Just the filename without path
        """
        return Path(file_path).name
    
    @staticmethod
    def sanitize_binary_name(binary_name: str) -> str:
        """
        Sanitize binary name for safe use in filenames and identifiers.
        
        Args:
            binary_name: Original binary name
            
        Returns:
            Sanitized name safe for use in filenames
        """
        # Remove extension and sanitize
        name = Path(binary_name).stem
        # Replace any non-alphanumeric characters with underscores
        sanitized = re.sub(r'[^\w\d]', '_', name)
        # Remove multiple consecutive underscores
        sanitized = re.sub(r'_+', '_', sanitized)
        # Remove leading/trailing underscores
        return sanitized.strip('_')
    
    @staticmethod
    def generate_default_project_filename(binary_name: str) -> str:
        """
        Generate a default project filename based on binary name.
        
        Args:
            binary_name: Name of the binary
            
        Returns:
            Default project filename with .aetherre extension
        """
        clean_name = FileService.sanitize_binary_name(binary_name)
        return f"{clean_name}.aetherre"
    
    @staticmethod
    def extract_binary_name_from_analysis(analysis_data: Dict[str, Any], fallback_filename: str) -> str:
        """
        Extract the original binary name from analysis data with fallback.
        
        Args:
            analysis_data: The analysis data structure
            fallback_filename: Filename to use if no binary name found in data
            
        Returns:
            The original binary name
        """
        # Try multiple possible locations for the binary name
        if isinstance(analysis_data, dict):
            # Check metadata first
            if 'metadata' in analysis_data and isinstance(analysis_data['metadata'], dict):
                if 'originalBinary' in analysis_data['metadata']:
                    return analysis_data['metadata']['originalBinary']
                if 'original_binary' in analysis_data['metadata']:
                    return analysis_data['metadata']['original_binary']
                if 'binary_name' in analysis_data['metadata']:
                    return analysis_data['metadata']['binary_name']
            
            # Check top level
            if 'originalBinary' in analysis_data:
                return analysis_data['originalBinary']
            if 'original_binary' in analysis_data:
                return analysis_data['original_binary']
            if 'binary_name' in analysis_data:
                return analysis_data['binary_name']
        
        # Fallback to filename without .json extension
        return FileService.remove_extension(fallback_filename)
    
    @staticmethod
    def remove_extension(filename: str) -> str:
        """
        Remove file extension from filename.
        
        Args:
            filename: Filename with extension
            
        Returns:
            Filename without extension
        """
        return Path(filename).stem
    
    @staticmethod
    def validate_file_path(file_path: str) -> Tuple[bool, str]:
        """
        Validate that a file path exists and is accessible.
        
        Args:
            file_path: Path to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            path = Path(file_path)
            
            if not path.exists():
                return False, "File does not exist"
            
            if not path.is_file():
                return False, "Path is not a file"
            
            if not os.access(file_path, os.R_OK):
                return False, "File is not readable"
            
            return True, ""
            
        except Exception as e:
            return False, f"Error validating file path: {str(e)}"
    
    @staticmethod
    def get_file_info(file_path: str) -> Dict[str, Any]:
        """
        Get comprehensive file information.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Dictionary with file information
        """
        try:
            path = Path(file_path)
            stat = path.stat()
            
            return {
                "path": str(path.absolute()),
                "filename": path.name,
                "stem": path.stem,
                "extension": path.suffix,
                "size": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "modified": stat.st_mtime,
                "exists": True,
                "is_file": path.is_file(),
                "is_readable": os.access(file_path, os.R_OK)
            }
        except Exception as e:
            return {
                "path": file_path,
                "filename": "",
                "stem": "",
                "extension": "",
                "size": 0,
                "size_mb": 0,
                "modified": 0,
                "exists": False,
                "is_file": False,
                "is_readable": False,
                "error": str(e)
            }
    
    @staticmethod
    def calculate_file_hash(file_path: str) -> str:
        """
        Calculate SHA256 hash of a file.
        
        Args:
            file_path: Path to the file
            
        Returns:
            SHA256 hash as hex string
        """
        hash_sha256 = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating hash for {file_path}: {str(e)}")
            raise Exception(f"Failed to calculate file hash: {str(e)}")
    
    @staticmethod
    def cleanup_temp_files(pattern: str) -> int:
        """
        Clean up temporary files matching a pattern.
        
        Args:
            pattern: Pattern to match files for deletion
            
        Returns:
            Number of files deleted
        """
        import glob
        import tempfile
        
        temp_dir = Path(tempfile.gettempdir())
        matching_files = glob.glob(str(temp_dir / pattern))
        
        deleted_count = 0
        for file_path in matching_files:
            try:
                os.remove(file_path)
                deleted_count += 1
                logger.info(f"Deleted temporary file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temporary file {file_path}: {str(e)}")
        
        return deleted_count 