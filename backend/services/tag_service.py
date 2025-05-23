#!/usr/bin/env python3
"""
Tag service for handling tag validation, management, and processing.
Handles all tag logic that was previously on the frontend.
"""

import json
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

from backend.services.validation_service import ValidationService

# Tag type definitions (matching frontend)
TAG_TYPES = {
    "Behavioral": {
        "description": "Describes what the function does",
        "examples": ["decryptor", "c2_handler", "keygen", "network_comm"]
    },
    "Structural": {
        "description": "Describes how the function fits into the program architecture",
        "examples": ["entrypoint", "syscall_wrapper", "helper_function"]
    },
    "Workflow": {
        "description": "Describes the analyst's workflow state",
        "examples": ["needs_review", "stumped", "false_positive", "suspicious"]
    }
}

# Predefined tag colors (matching frontend)
TAG_COLORS = [
    "#20D709",  # Green
    "#0000FF",  # Blue
    "#E91E63",  # Pink
    "#FF4500",  # Orange
    "#9C27B0",  # Purple
    "#FFD500",  # Yellow
    "#FF0000",  # Red
    "#009688",  # Teal
    "#8BC34A"   # Lime
]

class TagService:
    """Service for managing tags"""
    
    data_dir = Path("data")
    
    def __init__(self):
        self.data_dir.mkdir(exist_ok=True)
    
    @staticmethod
    def get_tag_types() -> Dict[str, Dict[str, Any]]:
        """
        Get available tag types and their descriptions.
        
        Returns:
            Dictionary of tag types with descriptions and examples
        """
        return TAG_TYPES
    
    @staticmethod
    def get_tag_colors() -> List[str]:
        """
        Get available tag colors.
        
        Returns:
            List of color hex codes
        """
        return TAG_COLORS
    
    def get_tags(self, binary: str, function_id: str) -> List[Dict[str, Any]]:
        """
        Get tags for a specific function.
        
        Args:
            binary: Name of the binary
            function_id: Function identifier
            
        Returns:
            List of tag objects
        """
        tags_file = self.data_dir / f"{binary}_function_tags.json"
        
        if not tags_file.exists():
            return []
        
        try:
            with open(tags_file, "r", encoding="utf-8") as f:
                all_tags = json.load(f)
            
            function_tags = all_tags.get(function_id, [])
            
            # Ensure all tags have required properties
            for tag in function_tags:
                if not tag.get('color'):
                    tag['color'] = TAG_COLORS[0]  # Default color
                if 'includeInAI' not in tag:
                    tag['includeInAI'] = True  # Default to true
            
            return function_tags
            
        except Exception as e:
            raise Exception(f"Error reading tags: {str(e)}")
    
    def save_tags(self, binary: str, function_id: str, tags: List[Dict[str, Any]]) -> None:
        """
        Save tags for a specific function.
        
        Args:
            binary: Name of the binary
            function_id: Function identifier
            tags: List of tag objects to save
        """
        tags_file = self.data_dir / f"{binary}_function_tags.json"
        
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
                
        except Exception as e:
            raise Exception(f"Error saving tags: {str(e)}")
    
    def add_tag(self, binary: str, function_id: str, tag_type: str, tag_value: str, 
                color: Optional[str] = None, include_in_ai: bool = True) -> Tuple[bool, Optional[str]]:
        """
        Add a new tag to a function.
        
        Args:
            binary: Name of the binary
            function_id: Function identifier
            tag_type: Type of tag
            tag_value: Value of the tag
            color: Optional color for the tag
            include_in_ai: Whether to include in AI context
            
        Returns:
            Tuple of (success, error_message)
        """
        # Get existing tags
        existing_tags = self.get_tags(binary, function_id)
        
        # Validate tag type
        if tag_type not in TAG_TYPES:
            return False, f"Invalid tag type: {tag_type}"
        
        # Validate tag value
        is_valid, error = ValidationService.validate_tag_value(tag_value, tag_type, existing_tags)
        if not is_valid:
            return False, error
        
        # Assign color if not provided
        if not color:
            color = TAG_COLORS[len(existing_tags) % len(TAG_COLORS)]
        
        # Create new tag
        new_tag = {
            "type": tag_type,
            "value": tag_value,
            "color": color,
            "includeInAI": include_in_ai
        }
        
        # Add to existing tags
        existing_tags.append(new_tag)
        
        # Save updated tags
        try:
            self.save_tags(binary, function_id, existing_tags)
            return True, None
        except Exception as e:
            return False, f"Failed to save tag: {str(e)}"
    
    def remove_tag(self, binary: str, function_id: str, tag_type: str, tag_value: str) -> Tuple[bool, Optional[str]]:
        """
        Remove a tag from a function.
        
        Args:
            binary: Name of the binary
            function_id: Function identifier
            tag_type: Type of tag to remove
            tag_value: Value of tag to remove
            
        Returns:
            Tuple of (success, error_message)
        """
        try:
            # Get existing tags
            existing_tags = self.get_tags(binary, function_id)
            
            # Find and remove the tag
            updated_tags = [
                tag for tag in existing_tags 
                if not (tag.get('type') == tag_type and tag.get('value') == tag_value)
            ]
            
            if len(updated_tags) == len(existing_tags):
                return False, f"Tag '{tag_value}' of type '{tag_type}' not found"
            
            # Save updated tags
            self.save_tags(binary, function_id, updated_tags)
            return True, None
            
        except Exception as e:
            return False, f"Failed to remove tag: {str(e)}"
    
    def toggle_ai_inclusion(self, binary: str, function_id: str, tag_type: str, tag_value: str) -> Tuple[bool, Optional[str]]:
        """
        Toggle the AI inclusion flag for a tag.
        
        Args:
            binary: Name of the binary
            function_id: Function identifier
            tag_type: Type of tag
            tag_value: Value of tag
            
        Returns:
            Tuple of (success, error_message)
        """
        try:
            # Get existing tags
            existing_tags = self.get_tags(binary, function_id)
            
            # Find and toggle the tag
            tag_found = False
            for tag in existing_tags:
                if tag.get('type') == tag_type and tag.get('value') == tag_value:
                    tag['includeInAI'] = not tag.get('includeInAI', True)
                    tag_found = True
                    break
            
            if not tag_found:
                return False, f"Tag '{tag_value}' of type '{tag_type}' not found"
            
            # Save updated tags
            self.save_tags(binary, function_id, existing_tags)
            return True, None
            
        except Exception as e:
            return False, f"Failed to toggle AI inclusion: {str(e)}"
    
    def get_ai_context_tags(self, binary: str, function_id: str) -> List[Dict[str, str]]:
        """
        Get tags that should be included in AI context.
        
        Args:
            binary: Name of the binary
            function_id: Function identifier
            
        Returns:
            List of tags with only type and value fields for AI context
        """
        all_tags = self.get_tags(binary, function_id)
        
        # Filter for AI context tags and return simplified format
        ai_tags = [
            {"type": tag["type"], "value": tag["value"]}
            for tag in all_tags
            if tag.get("includeInAI", True)
        ]
        
        return ai_tags
    
    def group_tags_by_type(self, tags: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Group tags by their type.
        
        Args:
            tags: List of tag objects
            
        Returns:
            Dictionary mapping tag types to lists of tags
        """
        grouped = {}
        
        # Initialize with all tag types
        for tag_type in TAG_TYPES:
            grouped[tag_type] = []
        
        # Group tags
        for tag in tags:
            tag_type = tag.get('type')
            if tag_type in grouped:
                grouped[tag_type].append(tag)
        
        return grouped
    
    def cleanup_tags(self, binary: str) -> Tuple[bool, str]:
        """
        Clean up all tag files for a specific binary.
        
        Args:
            binary: Name of the binary
            
        Returns:
            Tuple of (success, message)
        """
        try:
            tags_file = self.data_dir / f"{binary}_function_tags.json"
            
            if tags_file.exists():
                tags_file.unlink()
                return True, f"Cleaned up tag file for binary: {binary}"
            else:
                return True, f"No tag file found for binary: {binary}"
                
        except Exception as e:
            return False, f"Error cleaning up tags: {str(e)}" 