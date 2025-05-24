#!/usr/bin/env python3
"""
CFG Layout Computation Utility

This module contains the graph layout algorithms for Control Flow Graphs,
moved from the frontend for better performance and consistency.
"""

def compute_node_dimensions(node):
    """
    Calculate node dimensions based on content.
    Matches the frontend logic for consistency.
    """
    instruction_count = len(node.get('instructions', []))
    
    # Calculate height: 25px header + 15px per instruction line + 15px padding
    # Show up to 10 instructions + 1 "more" line if there are more
    lines_to_show = min(instruction_count, 10)
    has_more_line = instruction_count > 10
    
    min_height = 25 + (lines_to_show * 15) + (15 if has_more_line else 0) + 15
    
    return {
        'width': 250,  # Match frontend width
        'height': max(80, min_height)  # Match frontend minimum height
    }

def layered_layout_algorithm(nodes, edges):
    """
    Simple layered graph layout algorithm (similar to Sugiyama).
    Ported from the frontend CFGVisualizer implementation.
    """
    if not nodes:
        return {'nodePositions': [], 'edgeRoutes': []}
    
    # Create a map of node ids to indices
    node_map = {}
    for index, node in enumerate(nodes):
        node_map[node['id']] = index
    
    # Create adjacency lists
    outgoing = [[] for _ in range(len(nodes))]
    incoming = [[] for _ in range(len(nodes))]
    
    for edge in edges:
        source_idx = node_map.get(edge['source'])
        target_idx = node_map.get(edge['target'])
        if source_idx is not None and target_idx is not None:
            outgoing[source_idx].append(target_idx)
            incoming[target_idx].append(source_idx)
    
    # Assign layers (simple topological sort-based approach)
    layers = []
    node_layer = [-1] * len(nodes)
    stack = []
    visited = [False] * len(nodes)
    
    # Find roots (nodes with no incoming edges)
    for i in range(len(nodes)):
        if len(incoming[i]) == 0:
            stack.append(i)
    
    # If no roots found, take the first node
    if len(stack) == 0 and len(nodes) > 0:
        stack.append(0)
    
    # Do a BFS to assign layers
    layer = 0
    while stack:
        current_layer = []
        next_stack = []
        
        for node_idx in stack:
            if visited[node_idx]:
                continue
            visited[node_idx] = True
            node_layer[node_idx] = layer
            current_layer.append(node_idx)
            
            for target_idx in outgoing[node_idx]:
                if not visited[target_idx]:
                    next_stack.append(target_idx)
        
        layers.append(current_layer)
        stack = next_stack
        layer += 1
    
    # Check for any unvisited nodes and assign them to the deepest layer
    unvisited_nodes = []
    for i in range(len(nodes)):
        if not visited[i]:
            node_layer[i] = len(layers)
            unvisited_nodes.append(i)
    
    if unvisited_nodes:
        layers.append(unvisited_nodes)
    
    # Assign x coordinates (horizontally space nodes in each layer)
    node_positions = []
    for idx, node in enumerate(nodes):
        layer_idx = node_layer[idx]
        layer_nodes = layers[layer_idx]
        layer_index = layer_nodes.index(idx)
        
        # Increase horizontal spacing between nodes to prevent overlaps
        horizontal_spacing = 1200  # Match frontend spacing
        x = (layer_index + 1) * (horizontal_spacing / (len(layer_nodes) + 1))
        
        # Add vertical spacing between layers
        vertical_spacing = 250  # Match frontend spacing
        y = (layer_idx + 1) * vertical_spacing
        
        # Compute node dimensions
        dimensions = compute_node_dimensions(node)
        
        node_positions.append({
            'id': node['id'],
            'x': x,
            'y': y,
            'width': dimensions['width'],
            'height': dimensions['height']
        })
    
    return {
        'nodePositions': node_positions,
        'edgeRoutes': compute_edge_routes(edges, node_positions)
    }

def compute_edge_routes(edges, node_positions):
    """
    Compute edge routing information based on node positions.
    """
    edge_routes = []
    
    # Create a lookup for node positions
    pos_lookup = {pos['id']: pos for pos in node_positions}
    
    for edge in edges:
        source_pos = pos_lookup.get(edge['source'])
        target_pos = pos_lookup.get(edge['target'])
        
        if not source_pos or not target_pos:
            continue
        
        # Simple edge routing - straight line from source bottom to target top
        route = {
            'source': edge['source'],
            'target': edge['target'],
            'points': [
                {
                    'x': source_pos['x'],
                    'y': source_pos['y'] + source_pos['height'] / 2
                },
                {
                    'x': target_pos['x'],
                    'y': target_pos['y'] - target_pos['height'] / 2
                }
            ],
            'type': edge.get('type', 'unconditional')
        }
        
        edge_routes.append(route)
    
    return edge_routes

def compute_cfg_layout(cfg_data):
    """
    Main function to compute CFG layout.
    Takes raw CFG data and returns layout-enhanced CFG data.
    """
    if not cfg_data or not cfg_data.get('nodes'):
        return cfg_data
    
    nodes = cfg_data['nodes']
    edges = cfg_data.get('edges', [])
    
    # Compute layout
    layout = layered_layout_algorithm(nodes, edges)
    
    # Add layout information to the CFG data
    enhanced_cfg = cfg_data.copy()
    enhanced_cfg['layout'] = layout
    
    return enhanced_cfg 