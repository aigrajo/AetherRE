#!/usr/bin/env python3
"""
API endpoint for cross-reference (xrefs) operations.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, Literal
from pydantic import BaseModel
import logging

from backend.utils.helpers import analyze_xrefs
from backend.utils.helpers import process_function_data_with_enhancements

router = APIRouter(prefix="/api/xrefs")

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class XRefRequest(BaseModel):
    function_address: str
    direction: Literal['incoming', 'outgoing', 'all'] = 'all'
    sort_by: Literal['name', 'address', 'count'] = 'address'
    # Optionally, you could add binary or project id, etc.

@router.post("/", summary="Get cross-references for a function")
async def get_xrefs(
    request: XRefRequest
):
    """
    Returns filtered and sorted cross-references for a given function address.
    """
    try:
        # For demo: load function data from a static file (replace with your data source)
        import os, json
        # Get the project root directory
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
        data_path = os.path.join(project_root, 'data', 'RE1_functions.json')
        with open(data_path, 'r', encoding='utf-8') as f:
            function_data = json.load(f)
        
        # Enhance function data if needed
        enhanced_data = process_function_data_with_enhancements(function_data)
        xrefs = analyze_xrefs(None, enhanced_data)

        # Normalize address formats
        addr = request.function_address
        address_formats = [addr]
        if addr.startswith('0x'):
            address_formats.append(addr[2:])
        else:
            address_formats.append('0x' + addr)
        address_formats.append(addr.lower())
        address_formats.append(addr.upper())

        # Find matching refs
        incoming_refs = []
        outgoing_refs = []
        for a in address_formats:
            if xrefs['incoming'].get(a):
                incoming_refs = xrefs['incoming'][a]
                break
        for a in address_formats:
            if xrefs['outgoing'].get(a):
                outgoing_refs = xrefs['outgoing'][a]
                break

        # Filtering by direction
        direction = request.direction
        result = {}
        if direction in ('all', 'incoming'):
            result['incoming'] = incoming_refs
        if direction in ('all', 'outgoing'):
            result['outgoing'] = outgoing_refs

        # Sorting
        def get_func_name(addr):
            # Try to get function name from function data
            for func in function_data:
                if func.get('address') == addr:
                    return func.get('name', '')
            return ''
        
        def sort_refs(refs, is_outgoing=False):
            grouped = {}
            for ref in refs:
                func_addr = ref['target_func'] if is_outgoing else ref['source_func']
                grouped.setdefault(func_addr, []).append(ref)
            sort_by = request.sort_by
            if sort_by == 'name':
                return sorted(refs, key=lambda r: get_func_name(r['target_func'] if is_outgoing else r['source_func']))
            elif sort_by == 'address':
                return sorted(refs, key=lambda r: (r['target_func'] if is_outgoing else r['source_func'], r.get('offset', 0)))
            elif sort_by == 'count':
                return sorted(refs, key=lambda r: -len(grouped[r['target_func'] if is_outgoing else r['source_func']]))
            return refs
        
        if 'incoming' in result:
            result['incoming'] = sort_refs(result['incoming'], is_outgoing=False)
        if 'outgoing' in result:
            result['outgoing'] = sort_refs(result['outgoing'], is_outgoing=True)
        return result
    except Exception as e:
        logger.error(f"Error in get_xrefs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 