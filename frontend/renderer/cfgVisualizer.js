import { state } from './core.js';

// Function to update the CFG tab with the function's CFG data
export function updateCFGTab(func) {
  const cfgCanvas = document.getElementById('cfg-canvas');
  
  // Debug what we have in the function object
  console.log('Function object for CFG:', func);
  console.log('CFG data available:', func && func.cfg ? 'Yes' : 'No');
  
  if (!func || !func.cfg) {
    cfgCanvas.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
        <p>No CFG data available for this function.</p>
        <p style="margin-top: 10px; font-size: 12px;">
          Note: You need to analyze or re-analyze your binary with the updated Ghidra script to extract CFG data.
        </p>
      </div>`;
    return;
  }
  
  // Clear previous CFG
  cfgCanvas.innerHTML = '';
  
  // Create a new canvas for drawing the CFG
  const canvasElement = document.createElement('canvas');
  const pixelRatio = window.devicePixelRatio || 1;
  canvasElement.width = cfgCanvas.clientWidth * pixelRatio;
  canvasElement.height = cfgCanvas.clientHeight * pixelRatio;
  canvasElement.style.width = '100%';
  canvasElement.style.height = '100%';
  cfgCanvas.appendChild(canvasElement);
  
  // Store current pan and zoom state
  const viewState = {
    offsetX: 0,
    offsetY: 0,
    scale: 0.8, // Start with a slightly zoomed out view
    isDragging: false,
    lastX: 0,
    lastY: 0,
    selectedNode: null,
    pixelRatio: pixelRatio
  };
  
  // Prepare node and edge data
  const nodes = func.cfg.nodes.map(node => {
    const instructionCount = node.instructions.length;
    // Calculate node dimensions based on content
    // Ensure height can accommodate up to 11 lines (10 instructions + 1 "more" line)
    // 25px header + 15px per instruction line + 15px padding
    const minHeight = 25 + (Math.min(instructionCount, 10) * 15) + (instructionCount > 10 ? 15 : 0) + 15;
    return {
      id: node.id,
      address: node.start_address,
      endAddress: node.end_address,
      instructions: node.instructions,
      width: 250, // Increased width
      height: Math.max(80, minHeight)
    };
  });
  
  const edges = func.cfg.edges.map(edge => {
    return {
      source: edge.source,
      target: edge.target,
      type: edge.type
    };
  });
  
  // Use our custom graph layout algorithm from preload.js
  if (!window.CFGVisualizer) {
    console.error('CFGVisualizer not available in window');
    cfgCanvas.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
        <p>Error: CFG visualization library not available.</p>
      </div>`;
    return;
  }
  
  console.log('Using CFGVisualizer to layout graph');
  const layout = window.CFGVisualizer.layoutGraph(nodes, edges);
  console.log('Layout result:', layout);
  
  // Function to draw the CFG on the canvas
  function drawCFG() {
    const ctx = canvasElement.getContext('2d');
    const width = canvasElement.width;
    const height = canvasElement.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Apply view transformations
    ctx.save();
    ctx.scale(viewState.pixelRatio, viewState.pixelRatio);
    ctx.translate(width / (2 * viewState.pixelRatio) + viewState.offsetX, 50 + viewState.offsetY);
    ctx.scale(viewState.scale, viewState.scale);
    
    // Draw edges
    layout.edgeRoutes.forEach(edge => {
      const points = edge.points;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      // Draw either a straight line or a curved line
      if (points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
      } else {
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
      }
      
      // Style based on edge type
      if (edge.type === 'conditional') {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#4A4A4A';
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#2A2A2A';
      }
      
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw arrow
      const endPoint = points[points.length - 1];
      const prevPoint = points[points.length - 2] || points[0];
      
      const angle = Math.atan2(endPoint.y - prevPoint.y, endPoint.x - prevPoint.x);
      const arrowSize = 10;
      
      ctx.beginPath();
      ctx.moveTo(endPoint.x, endPoint.y);
      ctx.lineTo(
        endPoint.x - arrowSize * Math.cos(angle - Math.PI / 6),
        endPoint.y - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endPoint.x - arrowSize * Math.cos(angle + Math.PI / 6),
        endPoint.y - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = edge.type === 'conditional' ? '#4A4A4A' : '#2A2A2A';
      ctx.fill();
    });
    
    // Draw nodes
    layout.nodePositions.forEach(pos => {
      const node = nodes.find(n => n.id === pos.id);
      if (!node) return;
      
      const x = pos.x - pos.width / 2;
      const y = pos.y - pos.height / 2;
      
      // Node background
      ctx.fillStyle = viewState.selectedNode === node.id ? '#1C1C1C' : '#141414';
      ctx.strokeStyle = viewState.selectedNode === node.id ? '#E4E4E4' : '#2A2A2A';
      ctx.lineWidth = viewState.selectedNode === node.id ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, pos.width, pos.height, 4);
      ctx.fill();
      ctx.stroke();
      
      // Node title (address)
      ctx.fillStyle = '#A0A0A0';
      ctx.font = '12px monospace';
      ctx.fillText(`Address: ${node.address}`, x + 10, y + 20);
      
      // Node content (instructions)
      ctx.fillStyle = '#E4E4E4';
      ctx.font = '12px monospace';
      
      // Show up to 10 instructions
      const maxInstructions = Math.min(10, node.instructions.length);
      
      for (let i = 0; i < maxInstructions; i++) {
        const instr = node.instructions[i];
        const text = `${instr.mnemonic} ${instr.operands}`;
        ctx.fillText(
          text.length > 25 ? text.substring(0, 22) + '...' : text,
          x + 10,
          y + 40 + (i * 15)
        );
      }
      
      // Show count of remaining instructions as 11th line if there are more
      if (node.instructions.length > 10) {
        ctx.fillStyle = '#A0A0A0';
        ctx.fillText(
          `+ ${node.instructions.length - 10} more...`,
          x + 10,
          y + 40 + (10 * 15)
        );
      }
    });
    
    ctx.restore();
  }
  
  // Simple function to center the graph in the view
  function centerGraph() {
    // Start with a reasonable default offset and scale
    viewState.offsetX = 0;
    viewState.offsetY = 0;
    viewState.scale = 0.8;
  }
  
  // Helper to convert event coordinates to graph coordinates
  function eventToGraphCoords(e) {
    const rect = canvasElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / (rect.right - rect.left) * canvasElement.width / viewState.pixelRatio;
    const y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvasElement.height / viewState.pixelRatio;
    
    // Invert the view transformations
    const graphX = (x - canvasElement.width / (2 * viewState.pixelRatio) - viewState.offsetX) / viewState.scale;
    const graphY = (y - 50 - viewState.offsetY) / viewState.scale;
    
    return { x: graphX, y: graphY };
  }
  
  // Helper to check if a point is inside a node
  function isPointInNode(x, y, nodePos) {
    return (
      x >= nodePos.x - nodePos.width / 2 &&
      x <= nodePos.x + nodePos.width / 2 &&
      y >= nodePos.y - nodePos.height / 2 &&
      y <= nodePos.y + nodePos.height / 2
    );
  }
  
  // Handle mouse events
  canvasElement.addEventListener('mousedown', (e) => {
    viewState.isDragging = true;
    viewState.lastX = e.clientX;
    viewState.lastY = e.clientY;
    
    // Check if a node was clicked
    const coords = eventToGraphCoords(e);
    let foundNode = false;
    
    for (const nodePos of layout.nodePositions) {
      if (isPointInNode(coords.x, coords.y, nodePos)) {
        viewState.selectedNode = nodePos.id;
        foundNode = true;
        
        // Show node details when clicked
        const node = func.cfg.nodes.find(n => n.id === nodePos.id);
        if (node) {
          showNodeDetails(node);
        }
        
        drawCFG();
        break;
      }
    }
    
    if (!foundNode) {
      viewState.selectedNode = null;
      drawCFG();
    }
  });
  
  canvasElement.addEventListener('mousemove', (e) => {
    if (viewState.isDragging) {
      const dx = e.clientX - viewState.lastX;
      const dy = e.clientY - viewState.lastY;
      
      viewState.offsetX += dx;
      viewState.offsetY += dy;
      
      viewState.lastX = e.clientX;
      viewState.lastY = e.clientY;
      
      drawCFG();
    }
  });
  
  canvasElement.addEventListener('mouseup', () => {
    viewState.isDragging = false;
  });
  
  canvasElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    // Calculate zoom factor
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    
    // Apply zoom
    viewState.scale *= zoomFactor;
    
    // Limit zoom
    viewState.scale = Math.max(0.1, Math.min(3, viewState.scale));
    
    drawCFG();
  });
  
  // Add CFG toolbar functionality
  const zoomIn = document.getElementById('cfg-zoom-in');
  const zoomOut = document.getElementById('cfg-zoom-out');
  const fitButton = document.getElementById('cfg-fit');
  
  if (zoomIn) {
    zoomIn.addEventListener('click', () => {
      viewState.scale *= 1.2;
      viewState.scale = Math.min(3, viewState.scale);
      drawCFG();
    });
  }
  
  if (zoomOut) {
    zoomOut.addEventListener('click', () => {
      viewState.scale *= 0.8;
      viewState.scale = Math.max(0.1, viewState.scale);
      drawCFG();
    });
  }
  
  if (fitButton) {
    fitButton.addEventListener('click', () => {
      centerGraph();
      drawCFG();
    });
  }
  
  // Handle window resize
  const resizeObserver = new ResizeObserver(() => {
    const pixelRatio = window.devicePixelRatio || 1;
    viewState.pixelRatio = pixelRatio;
    canvasElement.width = cfgCanvas.clientWidth * pixelRatio;
    canvasElement.height = cfgCanvas.clientHeight * pixelRatio;
    drawCFG();
  });
  
  resizeObserver.observe(cfgCanvas);
  
  // Initial draw
  drawCFG();
}

// Function to show detailed instructions for a selected node
export function showNodeDetails(node) {
  console.log('Selected node:', node);
  
  // Create or get the details panel
  let detailsPanel = document.getElementById('cfg-node-details');
  if (!detailsPanel) {
    detailsPanel = document.createElement('div');
    detailsPanel.id = 'cfg-node-details';
    detailsPanel.className = 'cfg-node-details';
    detailsPanel.style.position = 'absolute';
    detailsPanel.style.right = '20px';
    detailsPanel.style.top = '60px';
    detailsPanel.style.width = '280px';
    detailsPanel.style.maxHeight = 'calc(100% - 80px)';
    detailsPanel.style.overflowY = 'auto';
    detailsPanel.style.background = 'var(--bg-secondary)';
    detailsPanel.style.border = '1px solid var(--border-color)';
    detailsPanel.style.borderRadius = '4px';
    detailsPanel.style.padding = '16px';
    detailsPanel.style.zIndex = '1000';
    detailsPanel.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.right = '10px';
    closeButton.style.top = '10px';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = 'var(--text-primary)';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.addEventListener('click', () => {
      detailsPanel.style.display = 'none';
    });
    
    detailsPanel.appendChild(closeButton);
    
    // Add to CFG canvas
    document.getElementById('cfg-canvas').appendChild(detailsPanel);
  }
  
  // Show the panel
  detailsPanel.style.display = 'block';
  
  // Clear previous content
  const closeButton = detailsPanel.firstChild;
  detailsPanel.innerHTML = '';
  detailsPanel.appendChild(closeButton);
  
  // Add title
  const title = document.createElement('h3');
  title.textContent = `Block: ${node.start_address}`;
  title.style.marginBottom = '12px';
  title.style.color = 'var(--text-primary)';
  title.style.fontSize = '16px';
  detailsPanel.appendChild(title);
  
  // Add address range
  const addressRange = document.createElement('div');
  addressRange.textContent = `Range: ${node.start_address} - ${node.end_address}`;
  addressRange.style.marginBottom = '16px';
  addressRange.style.color = 'var(--text-secondary)';
  addressRange.style.fontSize = '14px';
  detailsPanel.appendChild(addressRange);
  
  // Add instructions
  const instructionsTitle = document.createElement('div');
  instructionsTitle.textContent = 'Instructions:';
  instructionsTitle.style.marginBottom = '8px';
  instructionsTitle.style.color = 'var(--text-secondary)';
  instructionsTitle.style.fontSize = '14px';
  instructionsTitle.style.fontWeight = 'bold';
  detailsPanel.appendChild(instructionsTitle);
  
  const instructionsList = document.createElement('div');
  instructionsList.style.fontFamily = 'monospace';
  instructionsList.style.fontSize = '13px';
  instructionsList.style.color = 'var(--text-primary)';
  instructionsList.style.whiteSpace = 'pre-wrap';
  instructionsList.style.overflowX = 'auto';
  
  node.instructions.forEach((instr, i) => {
    const instrEl = document.createElement('div');
    instrEl.style.padding = '4px';
    instrEl.style.borderBottom = '1px solid var(--border-color)';
    instrEl.textContent = `${instr.mnemonic} ${instr.operands}`;
    instructionsList.appendChild(instrEl);
  });
  
  detailsPanel.appendChild(instructionsList);
} 