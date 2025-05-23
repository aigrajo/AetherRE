#!/usr/bin/env python3
"""
Validation service for function and variable names.
Handles all validation logic that was previously on the frontend.
"""

import re
from typing import Dict, List, Optional, Tuple, Any

# C language keywords for validation
C_KEYWORDS = [
    'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
    'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
    'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof',
    'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
    'volatile', 'while'
]

# Additional keywords that might cause conflicts
ADDITIONAL_KEYWORDS = [
    'bool', 'true', 'false', 'NULL', 'nullptr', '_Bool', 'inline', 'restrict',
    'complex', 'imaginary', 'alignas', 'alignof', 'atomic', 'static_assert',
    'noreturn', 'thread_local'
]

# Common function names that might cause conflicts
COMMON_FUNCTION_NAMES = [
    'main', 'printf', 'scanf', 'malloc', 'free', 'strlen', 'strcpy', 'strcmp',
    'memcpy', 'memset', 'exit', 'abort', 'system', 'getchar', 'putchar'
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
        Enhanced with more comprehensive checks.
        
        Args:
            name: The name to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not name or not name.strip():
            return False, "Name cannot be empty"
        
        name = name.strip()
        
        # Check minimum length
        if len(name) < 1:
            return False, "Name must be at least 1 character long"
        
        # Check maximum length (reasonable limit)
        if len(name) > 100:
            return False, "Name cannot exceed 100 characters"
        
        # Only allow alphanumeric and underscore
        valid_pattern = re.compile(r'^[a-zA-Z0-9_]+$')
        if not valid_pattern.match(name):
            return False, f"Invalid name: \"{name}\" - only letters, numbers, and underscores are allowed."
        
        # Don't allow names starting with a number
        if re.match(r'^[0-9]', name):
            return False, f"Invalid name: \"{name}\" - names cannot start with a number."
        
        # Don't allow names that are only underscores
        if re.match(r'^_+$', name):
            return False, f"Invalid name: \"{name}\" - names cannot consist only of underscores."
        
        # Don't allow names starting with double underscores (reserved for system)
        if name.startswith('__'):
            return False, f"Invalid name: \"{name}\" - names starting with double underscores are reserved."
        
        return True, None
    
    @staticmethod
    def validate_against_keywords(name: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that the name is not a reserved C keyword.
        Enhanced with additional keywords.
        
        Args:
            name: The name to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        all_keywords = C_KEYWORDS + ADDITIONAL_KEYWORDS
        
        if name.lower() in [keyword.lower() for keyword in all_keywords]:
            return False, f"Cannot rename to \"{name}\" - this is a reserved C keyword and would cause conflicts."
        
        # Check against common function names
        if name.lower() in [func.lower() for func in COMMON_FUNCTION_NAMES]:
            return False, f"Cannot rename to \"{name}\" - this is a common standard library function name and may cause conflicts."
        
        return True, None
    
    @staticmethod
    def validate_pseudocode_conflicts(name: str, pseudocode: Optional[str], old_name: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Advanced pseudocode conflict detection.
        
        Args:
            name: The new name to validate
            pseudocode: The pseudocode to check against
            old_name: The old name being replaced (optional)
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not pseudocode:
            return True, None
        
        # If we're doing a rename operation (old_name provided), simulate the rename first
        if old_name:
            # Create a simulated pseudocode where all instances of old_name are replaced with new_name
            old_name_pattern = re.compile(rf'\b{re.escape(old_name)}\b')
            simulated_pseudocode = old_name_pattern.sub(name, pseudocode)
            
            # Now check if there are any OTHER instances of the new name in the original pseudocode
            # that weren't part of the rename operation
            original_new_name_pattern = re.compile(rf'\b{re.escape(name)}\b')
            original_old_name_pattern = re.compile(rf'\b{re.escape(old_name)}\b')
            
            # Count occurrences in original pseudocode
            new_name_count_original = len(original_new_name_pattern.findall(pseudocode))
            old_name_count_original = len(original_old_name_pattern.findall(pseudocode))
            
            # Count occurrences in simulated pseudocode
            new_name_count_simulated = len(original_new_name_pattern.findall(simulated_pseudocode))
            
            # If the new name appears more times in the simulated code than we would expect
            # from just replacing the old name, then there were pre-existing conflicts
            expected_new_name_count = new_name_count_original + old_name_count_original
            
            if new_name_count_simulated > expected_new_name_count:
                extra_occurrences = new_name_count_simulated - expected_new_name_count
                return False, f"Cannot rename to \"{name}\" - this name already exists {extra_occurrences} other time(s) in the pseudocode and would cause conflicts."
            
            # Additional check for partial matches that could cause confusion
            # Check if the new name is a substring of existing identifiers or vice versa
            if len(name) >= 3:  # Only check for reasonable length names
                # Find all potential identifiers in the pseudocode
                identifier_pattern = re.compile(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b')
                identifiers = set(identifier_pattern.findall(pseudocode))
                
                # Remove the old name from consideration since we're replacing it
                identifiers.discard(old_name)
                identifiers.discard(name)  # Remove if it already exists (handled above)
                
                for identifier in identifiers:
                    # Check if new name is substring of existing identifier
                    if len(identifier) > len(name) and name in identifier:
                        return False, f"Cannot rename to \"{name}\" - this would create confusion with existing identifier \"{identifier}\" which contains your new name as a substring."
                    
                    # Check if existing identifier is substring of new name
                    if len(name) > len(identifier) and identifier in name and len(identifier) >= 3:
                        return False, f"Cannot rename to \"{name}\" - this would create confusion with existing identifier \"{identifier}\" which is a substring of your new name."
        else:
            # Not a rename operation, just check if the name exists
            name_pattern = re.compile(rf'\b{re.escape(name)}\b')
            if name_pattern.search(pseudocode):
                return False, f"Cannot rename to \"{name}\" - this name already exists in the pseudocode and would cause conflicts."
            
            # Also check for partial matches for new names
            if len(name) >= 3:
                identifier_pattern = re.compile(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b')
                identifiers = set(identifier_pattern.findall(pseudocode))
                
                for identifier in identifiers:
                    # Check if new name is substring of existing identifier
                    if len(identifier) > len(name) and name in identifier:
                        return False, f"Cannot rename to \"{name}\" - this would create confusion with existing identifier \"{identifier}\" which contains your new name as a substring."
                    
                    # Check if existing identifier is substring of new name
                    if len(name) > len(identifier) and identifier in name and len(identifier) >= 3:
                        return False, f"Cannot rename to \"{name}\" - this would create confusion with existing identifier \"{identifier}\" which is a substring of your new name."
        
        return True, None
    
    @staticmethod
    def validate_function_name(old_name: str, new_name: str, functions_data: Dict, 
                              current_function_id: str, pseudocode: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validate a function name change.
        Enhanced with better conflict detection and logging.
        
        Args:
            old_name: Current function name
            new_name: Proposed new function name
            functions_data: Functions data structure (can be None or empty)
            current_function_id: ID of the function being renamed
            pseudocode: Optional pseudocode to check for conflicts
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        print(f"[Validation] Function name validation: '{old_name}' -> '{new_name}'")
        print(f"[Validation] Current function ID: {current_function_id}")
        print(f"[Validation] Functions data available: {bool(functions_data)}")
        
        if old_name == new_name:
            print("[Validation] No change required")
            return True, None  # No change
        
        # Basic format validation
        is_valid, error = ValidationService.validate_name_format(new_name)
        if not is_valid:
            print(f"[Validation] Format validation failed: {error}")
            return is_valid, error
        
        # Keyword validation
        is_valid, error = ValidationService.validate_against_keywords(new_name)
        if not is_valid:
            print(f"[Validation] Keyword validation failed: {error}")
            return is_valid, error
        
        # Advanced pseudocode conflict detection
        is_valid, error = ValidationService.validate_pseudocode_conflicts(new_name, pseudocode, old_name)
        if not is_valid:
            print(f"[Validation] Pseudocode conflict detected: {error}")
            return is_valid, error
        
        # Check for function name conflicts (handle None or empty functions_data)
        if functions_data and isinstance(functions_data, dict) and 'functions' in functions_data:
            print(f"[Validation] Checking {len(functions_data['functions'])} functions for conflicts")
            for func in functions_data['functions']:
                if (func.get('name') == new_name and 
                    str(func.get('address', '')) != str(current_function_id)):
                    print(f"[Validation] Function name conflict found: {func.get('address')} already uses '{new_name}'")
                    return False, f"Cannot rename to \"{new_name}\" - a function with this name already exists in this program."
        else:
            print("[Validation] No functions data available for conflict checking")
        
        print("[Validation] Function name validation passed")
        return True, None
    
    @staticmethod
    def validate_variable_name(old_name: str, new_name: str, local_variables: List[Dict], 
                              pseudocode: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validate a variable name change.
        Enhanced with better conflict detection and logging.
        
        Args:
            old_name: Current variable name
            new_name: Proposed new variable name
            local_variables: List of local variables in the function
            pseudocode: Optional pseudocode to check for conflicts
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        print(f"[Validation] Variable name validation: '{old_name}' -> '{new_name}'")
        print(f"[Validation] Local variables count: {len(local_variables) if local_variables else 0}")
        
        if old_name == new_name:
            print("[Validation] No change required")
            return True, None  # No change
        
        # Basic format validation
        is_valid, error = ValidationService.validate_name_format(new_name)
        if not is_valid:
            print(f"[Validation] Format validation failed: {error}")
            return is_valid, error
        
        # Keyword validation
        is_valid, error = ValidationService.validate_against_keywords(new_name)
        if not is_valid:
            print(f"[Validation] Keyword validation failed: {error}")
            return is_valid, error
        
        # Advanced pseudocode conflict detection
        is_valid, error = ValidationService.validate_pseudocode_conflicts(new_name, pseudocode, old_name)
        if not is_valid:
            print(f"[Validation] Pseudocode conflict detected: {error}")
            return is_valid, error
        
        # Check variable conflicts
        if local_variables:
            print(f"[Validation] Checking {len(local_variables)} local variables for conflicts")
            for var in local_variables:
                if var.get('name') == new_name and var.get('name') != old_name:
                    print(f"[Validation] Variable name conflict found: '{var.get('name')}'")
                    return False, f"Cannot rename to \"{new_name}\" - a variable with this name already exists in this function."
        else:
            print("[Validation] No local variables to check for conflicts")
        
        print("[Validation] Variable name validation passed")
        return True, None
    
    @staticmethod
    def validate_tag_value(tag_value: str, tag_type: str, existing_tags: List[Dict]) -> Tuple[bool, Optional[str]]:
        """
        Validate a tag value.
        Enhanced with better format checking.
        
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
        
        # Check minimum length
        if len(tag_value) < 1:
            return False, "Tag value must be at least 1 character long"
        
        # Check maximum length
        if len(tag_value) > 50:
            return False, "Tag value cannot exceed 50 characters"
        
        # Allow more characters for tags but still reasonable
        if not re.match(r'^[a-zA-Z0-9_\-\s\.\(\)]+$', tag_value):
            return False, "Tag value contains invalid characters (only letters, numbers, spaces, hyphens, underscores, dots, and parentheses allowed)"
        
        # Check for duplicates
        for tag in existing_tags:
            if tag.get('type') == tag_type and tag.get('value') == tag_value:
                return False, f"Tag \"{tag_value}\" of type \"{tag_type}\" already exists"
        
        return True, None
    
    @staticmethod
    def batch_validate_function_names(
        rename_operations: List[Dict[str, Any]], 
        functions_data: Dict
    ) -> List[Tuple[bool, Optional[str]]]:
        """
        Batch validate multiple function name changes.
        
        Args:
            rename_operations: List of rename operations with 'old_name', 'new_name', 'function_id', 'pseudocode'
            functions_data: Functions data structure
            
        Returns:
            List of validation results
        """
        results = []
        
        # Create a temporary view of functions data with proposed changes
        temp_functions_data = functions_data.copy() if functions_data else {'functions': []}
        
        for operation in rename_operations:
            is_valid, error = ValidationService.validate_function_name(
                operation['old_name'],
                operation['new_name'],
                temp_functions_data,
                operation['function_id'],
                operation.get('pseudocode')
            )
            
            results.append((is_valid, error))
            
            # If valid, update temp data for subsequent validations
            if is_valid and temp_functions_data.get('functions'):
                for func in temp_functions_data['functions']:
                    if str(func.get('address', '')) == str(operation['function_id']):
                        func['name'] = operation['new_name']
                        break
        
        return results
    
    @staticmethod
    def batch_validate_variable_names(
        rename_operations: List[Dict[str, Any]], 
        local_variables: List[Dict]
    ) -> List[Tuple[bool, Optional[str]]]:
        """
        Batch validate multiple variable name changes.
        
        Args:
            rename_operations: List of rename operations with 'old_name', 'new_name', 'pseudocode'
            local_variables: List of local variables
            
        Returns:
            List of validation results
        """
        results = []
        
        # Create a temporary view of variables with proposed changes
        temp_variables = [var.copy() for var in local_variables] if local_variables else []
        
        for operation in rename_operations:
            is_valid, error = ValidationService.validate_variable_name(
                operation['old_name'],
                operation['new_name'],
                temp_variables,
                operation.get('pseudocode')
            )
            
            results.append((is_valid, error))
            
            # If valid, update temp data for subsequent validations
            if is_valid:
                for var in temp_variables:
                    if var.get('name') == operation['old_name']:
                        var['name'] = operation['new_name']
                        break
        
        return results 