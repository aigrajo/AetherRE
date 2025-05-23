#!/usr/bin/env python3
"""
Validation service for function and variable names.
Handles all validation logic that was previously on the frontend.
"""

import re
from typing import Dict, List, Optional, Tuple

# C language keywords for validation
C_KEYWORDS = [
    'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
    'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
    'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof',
    'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
    'volatile', 'while'
]

class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass

class ValidationService:
    """Service for validating function and variable names"""
    
    @staticmethod
    def validate_name_format(name: str) -> Tuple[bool, Optional[str]]:
        """
        Validate the basic format of a name.
        
        Args:
            name: The name to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not name or not name.strip():
            return False, "Name cannot be empty"
        
        name = name.strip()
        
        # Only allow alphanumeric and underscore
        valid_pattern = re.compile(r'^[a-zA-Z0-9_]+$')
        if not valid_pattern.match(name):
            return False, f"Invalid name: \"{name}\" - only letters, numbers, and underscores are allowed."
        
        # Don't allow names starting with a number
        if re.match(r'^[0-9]', name):
            return False, f"Invalid name: \"{name}\" - names cannot start with a number."
        
        return True, None
    
    @staticmethod
    def validate_against_keywords(name: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that the name is not a reserved C keyword.
        
        Args:
            name: The name to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if name.lower() in [keyword.lower() for keyword in C_KEYWORDS]:
            return False, f"Cannot rename to \"{name}\" - this is a reserved C keyword and would cause conflicts."
        
        return True, None
    
    @staticmethod
    def validate_function_name(old_name: str, new_name: str, functions_data: Dict, 
                              current_function_id: str, pseudocode: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validate a function name change.
        
        Args:
            old_name: Current function name
            new_name: Proposed new function name
            functions_data: Functions data structure (can be None or empty)
            current_function_id: ID of the function being renamed
            pseudocode: Optional pseudocode to check for conflicts
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if old_name == new_name:
            return True, None  # No change
        
        # Basic format validation
        is_valid, error = ValidationService.validate_name_format(new_name)
        if not is_valid:
            return is_valid, error
        
        # Keyword validation
        is_valid, error = ValidationService.validate_against_keywords(new_name)
        if not is_valid:
            return is_valid, error
        
        # Check if new name exists in pseudocode (would cause conflicts)
        if pseudocode and new_name in pseudocode:
            return False, f"Cannot rename to \"{new_name}\" - this name exists as part of other identifiers in the pseudocode and would cause conflicts."
        
        # Check for function name conflicts (handle None or empty functions_data)
        if functions_data and isinstance(functions_data, dict) and 'functions' in functions_data:
            for func in functions_data['functions']:
                if (func.get('name') == new_name and 
                    str(func.get('address', '')) != str(current_function_id)):
                    return False, f"Cannot rename to \"{new_name}\" - a function with this name already exists in this program."
        
        return True, None
    
    @staticmethod
    def validate_variable_name(old_name: str, new_name: str, local_variables: List[Dict], 
                              pseudocode: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validate a variable name change.
        
        Args:
            old_name: Current variable name
            new_name: Proposed new variable name
            local_variables: List of local variables in the function
            pseudocode: Optional pseudocode to check for conflicts
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if old_name == new_name:
            return True, None  # No change
        
        # Basic format validation
        is_valid, error = ValidationService.validate_name_format(new_name)
        if not is_valid:
            return is_valid, error
        
        # Keyword validation
        is_valid, error = ValidationService.validate_against_keywords(new_name)
        if not is_valid:
            return is_valid, error
        
        # Check if new name exists in pseudocode (complex conflict detection)
        if pseudocode:
            # Check if the new name exists anywhere in the pseudocode except in variable declarations
            if new_name in pseudocode:
                # More sophisticated check - see if it's only in the context of the variable being renamed
                declaration_pattern = re.compile(rf'(int|char|long|float|double|bool)\s+{re.escape(old_name)}\s*;')
                usage_pattern = re.compile(rf'\b{re.escape(old_name)}\b')
                
                declaration_match = declaration_pattern.search(pseudocode)
                usage_match = usage_pattern.search(pseudocode)
                
                # If we find the new name in a context other than replacing the old variable
                if not (declaration_match or usage_match):
                    return False, f"Cannot rename to \"{new_name}\" - this name exists as part of other identifiers in the pseudocode and would cause conflicts."
        
        # Check variable conflicts
        if local_variables:
            for var in local_variables:
                if var.get('name') == new_name and var.get('name') != old_name:
                    return False, f"Cannot rename to \"{new_name}\" - a variable with this name already exists in this function."
        
        return True, None
    
    @staticmethod
    def validate_tag_value(tag_value: str, tag_type: str, existing_tags: List[Dict]) -> Tuple[bool, Optional[str]]:
        """
        Validate a tag value.
        
        Args:
            tag_value: The tag value to validate
            tag_type: The type of tag
            existing_tags: List of existing tags to check for duplicates
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not tag_value or not tag_value.strip():
            return False, "Tag value cannot be empty"
        
        tag_value = tag_value.strip()
        
        # Check for duplicates
        for tag in existing_tags:
            if tag.get('type') == tag_type and tag.get('value') == tag_value:
                return False, f"Tag \"{tag_value}\" of type \"{tag_type}\" already exists"
        
        # Basic format validation (allow more characters for tags)
        if len(tag_value) > 50:
            return False, "Tag value cannot exceed 50 characters"
        
        # Don't allow only whitespace or special characters that might cause issues
        if not re.match(r'^[a-zA-Z0-9_\-\s]+$', tag_value):
            return False, "Tag value contains invalid characters"
        
        return True, None 