// Global variables
let monacoEditor = null;
let assemblyEditor = null;  // Add assembly editor variable
let functionsData = null;
let currentFunction = null;
let currentFilePath = null;
let originalBinaryName = null;  // Track the original binary name
let cfgInstance = null;  // Store the CFG visualization instance

// Chat session management
let currentSessionId = null;

// Helper functions
function getFunctionName(addressOrName) {
    if (!addressOrName) return null;
    if (!functionsData || !functionsData.functions) return addressOrName;
    
    // First try to find by exact address match
    const func = functionsData.functions.find(f => f.address === addressOrName);
    if (func) return func.name;
    
    // Try with/without 0x prefix
    const normalizedAddr = addressOrName.startsWith('0x') ? 
        addressOrName.substring(2) : 
        '0x' + addressOrName;
    const funcByNormalizedAddr = functionsData.functions.find(f => 
        f.address === normalizedAddr || 
        f.address === normalizedAddr.toLowerCase() || 
        f.address === normalizedAddr.toUpperCase()
    );
    if (funcByNormalizedAddr) return funcByNormalizedAddr.name;
    
    // If not found by address, check if it's already a name
    const funcByName = functionsData.functions.find(f => 
        f.name === addressOrName || 
        f.name.toLowerCase() === addressOrName.toLowerCase()
    );
    if (funcByName) return funcByName.name;
    
    // If we can't find it, return the original value
    return addressOrName;
}

// DOM Elements
const loadFileBtn = document.getElementById('load-file-btn');
const fileInput = document.getElementById('file-input');
const progressContainer = document.getElementById('analysis-progress');
const progressFill = document.querySelector('.progress-fill');
const progressText = document.querySelector('.progress-text');
const functionList = document.getElementById('function-list');
const functionFilter = document.getElementById('function-filter');
const functionNameEl = document.getElementById('function-name');
const functionAddressEl = document.getElementById('function-address');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');
const appTitle = document.querySelector('.app-header h1');

// Chat functionality
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

// DOM Elements for chat session management
const newChatBtn = document.getElementById('new-chat-btn');
const chatSessionsSelect = document.getElementById('chat-sessions-select');

// Initialize Monaco Editor
function initMonacoEditor() {
  // Load Monaco from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js';
  script.onload = () => {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
      // Initialize pseudocode editor
      monacoEditor = monaco.editor.create(document.getElementById('pseudocode-editor'), {
        value: '// Load a binary analysis file to view pseudocode',
        language: 'cpp',
        theme: 'vs-dark',
        readOnly: true,
        minimap: {
          enabled: true
        },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 14,
        fontFamily: "'Consolas', 'Courier New', monospace",
        renderLineHighlight: 'all'
      });

      // Initialize assembly editor
      assemblyEditor = monaco.editor.create(document.getElementById('assembly-editor'), {
        value: '// Load a binary analysis file to view assembly',
        language: 'asm',
        theme: 'vs-dark',
        readOnly: true,
        minimap: {
          enabled: true
        },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 14,
        fontFamily: "'Consolas', 'Courier New', monospace",
        renderLineHighlight: 'all'
      });
      
      // Resize editors when window resizes
      window.addEventListener('resize', () => {
        if (monacoEditor) {
          monacoEditor.layout();
        }
        if (assemblyEditor) {
          assemblyEditor.layout();
        }
      });
    });
  };
  document.head.appendChild(script);
}

// Initialize file handling
function initFileHandling() {
  const appHeader = document.querySelector('.app-header');
  
  loadFileBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const isBinary = !file.name.endsWith('.json');
    
    try {
      if (!window.api) {
        throw new Error('API not available - please restart the application');
      }

      if (isBinary) {
        // Store original binary name
        originalBinaryName = file.name;
        
        // Show progress bar and hide load button
        progressContainer.style.display = 'flex';
        appHeader.classList.add('analyzing');
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting analysis...';

        // Start binary analysis
        const result = await window.api.analyzeBinary(file.path, (progress) => {
          // Update progress bar
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `Analyzing binary... ${progress}%`;
        });

        // Hide progress bar and show load button
        progressContainer.style.display = 'none';
        appHeader.classList.remove('analyzing');
        
        if (result) {
          functionsData = result.data;
          window.currentData = functionsData;
          currentFilePath = result.path;
          updateUIWithFile(originalBinaryName);
          renderFunctionList(functionsData.functions);
        }
      } else {
        // For JSON files, try to extract original binary name from the data
        const result = await window.api.loadJsonFile(file.path);
        if (result) {
          functionsData = result.data;
          window.currentData = functionsData;
          currentFilePath = result.path;
          
          // Try to get original binary name from the analysis data
          originalBinaryName = functionsData.metadata?.originalBinary || 
                             functionsData.originalBinary ||
                             file.name.replace('.json', '');
          
          updateUIWithFile(originalBinaryName);
          renderFunctionList(functionsData.functions);
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      progressContainer.style.display = 'none';
      appHeader.classList.remove('analyzing');
      // Show error to user
      alert(`Error processing file: ${error.message}`);
    }
  });
}

// Check if there are any recent analyses
async function checkRecentAnalyses() {
  try {
    if (!window.api) {
      console.warn('API not available - skipping recent analyses check');
      return;
    }
    const files = await window.api.getAnalysisFiles();
    if (files.length > 0) {
      // Could display recent files here or auto-load the most recent
      console.log('Recent analysis files:', files);
    }
  } catch (error) {
    console.error('Error checking recent analyses:', error);
  }
}

// Update UI elements with the current file info
function updateUIWithFile(filename) {
  if (!filename) return;
  
  // Clean up the filename to make it more presentable
  const cleanName = filename.replace(/\.[^/.]+$/, ''); // Remove file extension
  
  document.title = `AetherRE - ${cleanName}`;
  appTitle.innerHTML = `AetherRE <span class="current-file">${cleanName}</span>`;
}

// Render the function list
function renderFunctionList(functions) {
  // Clear the list
  functionList.innerHTML = '';
  
  if (!functions || functions.length === 0) {
    functionList.innerHTML = '<div class="no-functions">No functions found</div>';
    return;
  }
  
  // Sort functions by name
  functions.sort((a, b) => a.name.localeCompare(b.name));
  
  // Add each function to the list
  functions.forEach(func => {
    const funcElement = document.createElement('div');
    funcElement.className = 'function-item';
    funcElement.textContent = func.name;
    funcElement.dataset.address = func.address;
    
    funcElement.addEventListener('click', () => {
      // Select the function
      document.querySelectorAll('.function-item').forEach(el => {
        el.classList.remove('selected');
      });
      funcElement.classList.add('selected');
      
      // Display the function info
      displayFunctionInfo(func);
    });
    
    functionList.appendChild(funcElement);
  });
}

// Filter functions based on search term
function filterFunctions(searchTerm) {
  if (!functionsData || !functionsData.functions) return;
  
  searchTerm = searchTerm.toLowerCase();
  const filteredFunctions = functionsData.functions.filter(func => 
    func.name.toLowerCase().includes(searchTerm)
  );
  
  renderFunctionList(filteredFunctions);
}

// Function to display function info
function displayFunctionInfo(func) {
  if (!func) {
    return;
  }
  
  currentFunction = func;
  
  // Update function name and address
  functionNameEl.textContent = func.name;
  functionAddressEl.textContent = func.address;
  
  // Update pseudocode
  if (monacoEditor) {
    const pseudocode = func.pseudocode || '// No pseudocode available';
    monacoEditor.setValue(pseudocode);
  }

  // Update tabs based on data availability
  updateAssemblyTab(func);
  updateXRefsTab(func);
  updateVariablesTab(func);
  updateStringsTab(func);
  updateCFGTab(func);  // Add CFG tab update
}

// Tab switching function
function switchTab(tabName) {
  console.log('Switching to tab:', tabName);
  
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  
  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}-tab`);
  });
  
  // Refresh editor layout when switching to pseudocode or assembly tab
  if ((tabName === 'pseudocode' || tabName === 'assembly') && monacoEditor) {
    setTimeout(() => {
      if (tabName === 'pseudocode') {
        monacoEditor.layout();
      } else if (tabName === 'assembly' && assemblyEditor) {
        assemblyEditor.layout();
      }
    }, 0);
  }
  
  // If switching to xrefs tab, force update
  if (tabName === 'xrefs' && window.currentFunction) {
    console.log('Force updating xrefs tab for:', window.currentFunction);
    updateXRefsTab(window.currentFunction);
  }
}

// Event listeners
functionFilter.addEventListener('input', (event) => {
  filterFunctions(event.target.value);
});

// Update event listeners and selectFunction override to pass the function object
// ... rest of the file ...
// In selectFunction, pass the function object to updateXRefsTab
const originalSelectFunction = window.selectFunction;
window.selectFunction = function(functionObj) {
    originalSelectFunction(functionObj);
    updateXRefsTab(functionObj);
};
// In event listeners, use currentFunction (which is a function object)
document.getElementById('xref-direction-filter').addEventListener('change', () => {
    if (window.currentFunction) {
        updateXRefsTab(window.currentFunction);
    }
});
document.getElementById('xref-sort-by').addEventListener('change', () => {
    if (window.currentFunction) {
        updateXRefsTab(window.currentFunction);
    }
});

// Helper function to find function by address or name
function findFunction(addressOrName) {
    if (!functionsData || !functionsData.functions) return null;
    
    // Try exact match first
    let func = functionsData.functions.find(f => 
        f.address === addressOrName || 
        f.name === addressOrName
    );
    
    if (func) return func;
    
    // Try with/without 0x prefix
    const normalizedAddr = addressOrName.startsWith('0x') ? 
        addressOrName.substring(2) : 
        '0x' + addressOrName;
    
    func = functionsData.functions.find(f => 
        f.address === normalizedAddr || 
        f.address === normalizedAddr.toLowerCase() || 
        f.address === normalizedAddr.toUpperCase()
    );
    
    if (func) return func;
    
    // Try case-insensitive name match
    return functionsData.functions.find(f => 
        f.name.toLowerCase() === addressOrName.toLowerCase()
    );
}

// Helper function to handle xref row clicks
function handleXRefRowClick(row, targetFunc, event) {
    // If the click was on a link, prevent default behavior
    if (event && event.target.classList.contains('xref-link')) {
        event.preventDefault();
    }
    
    // Add visual feedback
    const allRows = document.querySelectorAll('#incoming-xrefs-table tr, #outgoing-xrefs-table tr');
    allRows.forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    
    // Find and navigate to the function
    const func = findFunction(targetFunc);
    if (func) {
        // Update function list selection
        const functionItems = document.querySelectorAll('.function-item');
        functionItems.forEach(item => item.classList.remove('selected'));
        const functionItem = document.querySelector(`.function-item[data-address="${func.address}"]`);
        if (functionItem) {
            functionItem.classList.add('selected');
            functionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Update function display
        displayFunctionInfo(func);
    } else {
        console.warn('Could not find function:', targetFunc);
    }
}

// Helper function to group references by function
function groupReferencesByFunction(refs) {
    const grouped = new Map();
    
    refs.forEach(ref => {
        const funcAddr = ref.source_func || ref.target_func;
        if (!grouped.has(funcAddr)) {
            grouped.set(funcAddr, []);
        }
        grouped.get(funcAddr).push(ref);
    });
    
    return grouped;
}

// Cross References Tab Functions
function updateXRefsTab(functionObj) {
    console.log('updateXRefsTab called with:', functionObj);
    
    if (!functionObj) {
        console.error('No function object provided to updateXRefsTab');
        return;
    }
    
    // Get the tables and sections
    const incomingTable = document.getElementById('incoming-xrefs-table').getElementsByTagName('tbody')[0];
    const outgoingTable = document.getElementById('outgoing-xrefs-table').getElementsByTagName('tbody')[0];
    const incomingSection = document.querySelector('.xref-section:nth-child(1)');
    const outgoingSection = document.querySelector('.xref-section:nth-child(2)');
    
    // Clear existing rows
    incomingTable.innerHTML = '';
    outgoingTable.innerHTML = '';
    
    // Try to find the cross_references data in various places
    let xrefs = null;
    let dataSources = [
        window.currentData?.cross_references,
        functionsData?.cross_references,
        window?.cross_references
    ];
    
    for (const source of dataSources) {
        if (source && source.incoming && source.outgoing) {
            xrefs = source;
            console.log('Found xrefs data source:', source);
            break;
        }
    }
    
    if (!xrefs) {
        console.error('No cross_references data found in any data source');
        incomingTable.innerHTML = '<tr><td colspan="5">No cross-reference data available</td></tr>';
        outgoingTable.innerHTML = '<tr><td colspan="5">No cross-reference data available</td></tr>';
        return;
    }
    
    // Get function address in various formats to try matching
    const addressFormats = [];
    if (functionObj.address) {
        addressFormats.push(functionObj.address);
        if (functionObj.address.startsWith('0x')) {
            addressFormats.push(functionObj.address.substring(2));
        } else {
            addressFormats.push('0x' + functionObj.address);
        }
        addressFormats.push(functionObj.address.toLowerCase());
        addressFormats.push(functionObj.address.toUpperCase());
    }
    
    // Find matching refs using any of the address formats
    let incomingRefs = [];
    let outgoingRefs = [];
    
    for (const addr of addressFormats) {
        if (xrefs.incoming[addr] && xrefs.incoming[addr].length > 0) {
            incomingRefs = xrefs.incoming[addr];
            break;
        }
    }
    
    for (const addr of addressFormats) {
        if (xrefs.outgoing[addr] && xrefs.outgoing[addr].length > 0) {
            outgoingRefs = xrefs.outgoing[addr];
            break;
        }
    }
    
    // Apply filters
    const directionFilter = document.getElementById('xref-direction-filter').value;
    const sortBy = document.getElementById('xref-sort-by').value;
    
    // Show/hide sections based on direction filter
    incomingSection.style.display = (directionFilter === 'all' || directionFilter === 'incoming') ? 'block' : 'none';
    outgoingSection.style.display = (directionFilter === 'all' || directionFilter === 'outgoing') ? 'block' : 'none';
    
    // Sort references
    const sortReferences = (refs, isOutgoing = false) => {
        try {
            return [...refs].sort((a, b) => {
                const aAddr = isOutgoing ? a.target_func : a.source_func;
                const bAddr = isOutgoing ? b.target_func : b.source_func;
                
                // Group references by function for count-based sorting
                const grouped = new Map();
                refs.forEach(ref => {
                    const funcAddr = isOutgoing ? ref.target_func : ref.source_func;
                    if (!grouped.has(funcAddr)) {
                        grouped.set(funcAddr, []);
                    }
                    grouped.get(funcAddr).push(ref);
                });
                
                switch (sortBy) {
                    case 'name':
                        return (getFunctionName(aAddr) || '').localeCompare(getFunctionName(bAddr) || '');
                    case 'address':
                        // First sort by address
                        const addrCompare = aAddr.localeCompare(bAddr);
                        if (addrCompare !== 0) return addrCompare;
                        // Then by offset if addresses are the same
                        return (a.offset || 0) - (b.offset || 0);
                    case 'count':
                        // Compare by number of references to each function
                        const aCount = grouped.get(aAddr)?.length || 0;
                        const bCount = grouped.get(bAddr)?.length || 0;
                        if (bCount !== aCount) return bCount - aCount;
                        // If counts are equal, sort by offset
                        return (a.offset || 0) - (b.offset || 0);
                    default:
                        return 0;
                }
            });
        } catch (err) {
            console.error('Error sorting references:', err);
            return refs;
        }
    };

    // Sort references
    const sortedIncoming = sortReferences(incomingRefs, false);
    const sortedOutgoing = sortReferences(outgoingRefs, true);
    
    // Populate incoming table if visible
    if (incomingSection.style.display !== 'none') {
        if (sortedIncoming.length === 0) {
            incomingTable.innerHTML = '<tr><td colspan="5">No incoming references found</td></tr>';
        } else {
            let lastAddr = null;
            sortedIncoming.forEach(ref => {
                try {
                    const row = incomingTable.insertRow();
                    const name = getFunctionName(ref.source_func) || 'Unknown';
                    const addr = ref.source_func;
                    
                    // Add a visual separator between different functions
                    if (lastAddr && lastAddr !== addr) {
                        row.classList.add('function-separator');
                    }
                    lastAddr = addr;
                    
                    row.innerHTML = `
                        <td class="xref-name"><a href="#" class="xref-link">${name}</a></td>
                        <td class="xref-address">${addr || 'Unknown'}</td>
                        <td class="xref-offset">${(ref.offset || 0).toString(16)}</td>
                        <td class="xref-context">${ref.context || ''}</td>
                    `;
                    
                    // Add click handlers
                    const link = row.querySelector('.xref-link');
                    link.addEventListener('click', (e) => handleXRefRowClick(row, ref.source_func, e));
                    row.addEventListener('click', (e) => handleXRefRowClick(row, ref.source_func, e));
                } catch (err) {
                    console.error('Error creating incoming reference row:', err);
                }
            });
        }
    }
    
    // Populate outgoing table if visible
    if (outgoingSection.style.display !== 'none') {
        if (sortedOutgoing.length === 0) {
            outgoingTable.innerHTML = '<tr><td colspan="5">No outgoing references found</td></tr>';
        } else {
            let lastAddr = null;
            sortedOutgoing.forEach(ref => {
                try {
                    const row = outgoingTable.insertRow();
                    const name = getFunctionName(ref.target_func) || 'Unknown';
                    const addr = ref.target_func;
                    
                    // Add a visual separator between different functions
                    if (lastAddr && lastAddr !== addr) {
                        row.classList.add('function-separator');
                    }
                    lastAddr = addr;
                    
                    row.innerHTML = `
                        <td class="xref-name"><a href="#" class="xref-link">${name}</a></td>
                        <td class="xref-address">${addr || 'Unknown'}</td>
                        <td class="xref-offset">${(ref.offset || 0).toString(16)}</td>
                        <td class="xref-context">${ref.context || ''}</td>
                    `;
                    
                    // Add click handlers
                    const link = row.querySelector('.xref-link');
                    link.addEventListener('click', (e) => handleXRefRowClick(row, ref.target_func, e));
                    row.addEventListener('click', (e) => handleXRefRowClick(row, ref.target_func, e));
                } catch (err) {
                    console.error('Error creating outgoing reference row:', err);
                }
            });
        }
    }
}

// Add these functions after the global variables section
function renameVariable(oldName, newName) {
    if (!currentFunction || !oldName || !newName || oldName === newName) return;
    
    // Update in local_variables
    if (currentFunction.local_variables) {
        currentFunction.local_variables.forEach(variable => {
            if (variable.name === oldName) {
                variable.name = newName;
            }
        });
    }
    
    // Update in pseudocode
    if (currentFunction.pseudocode) {
        // Create a regex that matches the variable name as a whole word
        const regex = new RegExp(`\\b${oldName}\\b`, 'g');
        currentFunction.pseudocode = currentFunction.pseudocode.replace(regex, newName);
    }
    
    // Update the display
    displayFunctionInfo(currentFunction);
}

function makeVariableEditable(element, variableName) {
    element.classList.add('editable');
    element.title = 'Click to rename variable';
    
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = variableName;
        input.className = 'variable-rename-input';
        
        // Replace the text with input
        element.textContent = '';
        element.appendChild(input);
        input.focus();
        
        // Select all text
        input.setSelectionRange(0, input.value.length);
        
        const finishEditing = () => {
            const newName = input.value.trim();
            if (newName && newName !== variableName) {
                renameVariable(variableName, newName);
            }
            element.textContent = newName || variableName;
        };
        
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                element.textContent = variableName;
            }
        });
    });
}

// Function to update the CFG tab with the function's CFG data
function updateCFGTab(func) {
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
  canvasElement.width = cfgCanvas.clientWidth;
  canvasElement.height = cfgCanvas.clientHeight;
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
    selectedNode: null
  };
  
  // Prepare node and edge data
  const nodes = func.cfg.nodes.map(node => {
    const instructionCount = node.instructions.length;
    // Calculate node dimensions based on content
    return {
      id: node.id,
      address: node.start_address,
      endAddress: node.end_address,
      instructions: node.instructions,
      width: 200,
      height: Math.max(80, 20 + instructionCount * 15)
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
    ctx.translate(width / 2 + viewState.offsetX, 50 + viewState.offsetY);
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
      
      // Show up to 3 instructions
      const maxInstructions = Math.min(3, node.instructions.length);
      for (let i = 0; i < maxInstructions; i++) {
        const instr = node.instructions[i];
        const text = `${instr.mnemonic} ${instr.operands}`;
        ctx.fillText(
          text.length > 25 ? text.substring(0, 22) + '...' : text,
          x + 10,
          y + 40 + (i * 15)
        );
      }
      
      // Show count of remaining instructions
      if (node.instructions.length > maxInstructions) {
        ctx.fillStyle = '#A0A0A0';
        ctx.fillText(
          `+ ${node.instructions.length - maxInstructions} more...`,
          x + 10,
          y + 40 + (maxInstructions * 15)
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
    const x = (e.clientX - rect.left) / (rect.right - rect.left) * canvasElement.width;
    const y = (e.clientY - rect.top) / (rect.bottom - rect.top) * canvasElement.height;
    
    // Invert the view transformations
    const graphX = (x - canvasElement.width / 2 - viewState.offsetX) / viewState.scale;
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
    canvasElement.width = cfgCanvas.clientWidth;
    canvasElement.height = cfgCanvas.clientHeight;
    drawCFG();
  });
  
  resizeObserver.observe(cfgCanvas);
  
  // Initial draw
  drawCFG();
}

// Function to show detailed instructions for a selected node
function showNodeDetails(node) {
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

// Function to setup context toggle checkboxes
function setupContextToggles() {
  // Get all toggle checkboxes
  const toggles = document.querySelectorAll('.toggle-label input[type="checkbox"]');
  
  // Add event listeners to each toggle
  toggles.forEach(toggle => {
    const label = toggle.closest('.toggle-label');
    
    // Apply initial styling based on checked state
    if (toggle.checked) {
      label.style.backgroundColor = 'var(--accent-color)';
      label.style.borderColor = 'var(--accent-color)';
      label.style.color = 'var(--text-primary)';
    } else {
      label.style.backgroundColor = 'var(--bg-tertiary)';
      label.style.borderColor = 'transparent';
      label.style.color = 'var(--text-secondary)';
    }
    
    toggle.addEventListener('change', () => {
      console.log(`Toggle ${toggle.id} changed to ${toggle.checked}`);
      
      // Update visual style based on the checked state
      if (toggle.checked) {
        label.style.backgroundColor = 'var(--accent-color)';
        label.style.borderColor = 'var(--accent-color)';
        label.style.color = 'var(--text-primary)';
      } else {
        label.style.backgroundColor = 'var(--bg-tertiary)';
        label.style.borderColor = 'transparent';
        label.style.color = 'var(--text-secondary)';
      }
    });
  });
}

// Function to initialize everything
function init() {
  initMonacoEditor();
  initFileHandling();
  checkRecentAnalyses();
  setupTabSwitching();
  
  // Initialize chat functionality
  initializeChatSession();
  
  // Setup event handlers for context toggles
  setupContextToggles();
  
  // Window resize handling for editors
  window.addEventListener('resize', () => {
    if (monacoEditor) {
      monacoEditor.layout();
    }
    if (assemblyEditor) {
      assemblyEditor.layout();
    }
    if (cfgInstance) {
      // Update CFG layout on resize
      const cfgCanvas = document.getElementById('cfg-canvas');
      if (cfgCanvas) {
        const width = cfgCanvas.clientWidth;
        const height = cfgCanvas.clientHeight;
        cfgInstance.svg.attr('viewBox', `0 0 ${width} ${height}`);
        cfgInstance.simulation.force('center', d3.forceCenter(width / 2, height / 2));
        cfgInstance.simulation.alpha(0.3).restart();
      }
    }
  });
}

// Setup tab switching
function setupTabSwitching() {
  // Add click handlers to all tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });
  });
  
  // Set initial active tab
  const defaultTab = 'pseudocode';
  switchTab(defaultTab);
}

// Start the application
init();

// Ensure Monaco editors layout after a short delay on load
setTimeout(() => {
  if (window.monacoEditor && window.monacoEditor.layout) window.monacoEditor.layout();
  if (window.assemblyEditor && window.assemblyEditor.layout) window.assemblyEditor.layout();
}, 150);

// Also ensure layout after any window resize
window.addEventListener('resize', () => {
  if (window.monacoEditor && window.monacoEditor.layout) window.monacoEditor.layout();
  if (window.assemblyEditor && window.assemblyEditor.layout) window.assemblyEditor.layout();
});

// Configure marked options for better markdown rendering
if (window.marked) {
  marked.setOptions({
    gfm: true, // Enable GitHub Flavored Markdown
    breaks: true, // Add <br> on single line breaks
    headerIds: false, // Disable header IDs to prevent XSS
    mangle: false, // Disable mangling to prevent XSS
    smartLists: true, // Use smarter list behavior
    smartypants: true, // Use smart punctuation
    highlight: function(code, lang) {
      if (window.hljs && lang) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          return code;
        }
      }
      return code;
    }
  });
}

// Chat functionality
function addMessage(content, isUser = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  if (isUser) {
    messageDiv.textContent = content;
  } else {
    // Render markdown for assistant responses, sanitize, and highlight
    if (window.marked && window.DOMPurify) {
      const rawHtml = window.marked.parse(content);
      const cleanHtml = window.DOMPurify.sanitize(rawHtml);
      messageDiv.innerHTML = cleanHtml;
      if (window.hljs) {
        // Highlight code blocks
        messageDiv.querySelectorAll('pre code').forEach((block) => {
          window.hljs.highlightElement(block);
        });
      }
    } else {
      messageDiv.textContent = content;
    }
  }
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize chat session
async function initializeChatSession() {
  try {
    // First, refresh sessions to get all existing ones
    await refreshChatSessions(false); // false means don't select any session
    
    // Then create a new session
    const response = await window.electronAPI.createNewChat();
    currentSessionId = response.session_id;
    
    // Clear chat messages for the new session
    chatMessages.innerHTML = '';
    
    // Update dropdown to show all sessions plus a default option for the new one
    updateSessionDropdown();
  } catch (error) {
    console.error('[Chat] Error initializing chat session:', error);
  }
}

// Update the sessions dropdown with all sessions plus default option
function updateSessionDropdown() {
  // Get all current options (these are the existing sessions)
  const currentOptions = Array.from(chatSessionsSelect.options);
  
  // Clear dropdown
  chatSessionsSelect.innerHTML = '';
  
  // Add default option for new/unsaved session
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Write a prompt to create a chat session';
  chatSessionsSelect.appendChild(defaultOption);
  
  // Add back all the session options
  currentOptions.forEach(option => {
    // Skip the default option if it exists
    if (option.value !== '') {
      chatSessionsSelect.appendChild(option.cloneNode(true));
    }
  });
  
  // Select default option for new session
  chatSessionsSelect.value = '';
}

// Refresh chat sessions list
async function refreshChatSessions(selectCurrentSession = true) {
  try {
    const response = await window.electronAPI.listChatSessions();
    const sessions = response.sessions;
    
    // Save current options to check if we need to add the default option
    const hasDefaultOption = chatSessionsSelect.querySelector('option[value=""]') !== null;
    
    // Clear existing options
    chatSessionsSelect.innerHTML = '';
    
    // Add default option if it was there before or if no sessions exist
    if (hasDefaultOption || sessions.length === 0) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Write a prompt to create a chat session';
      chatSessionsSelect.appendChild(defaultOption);
    }
    
    // Add session options
    sessions.forEach(session => {
      const option = document.createElement('option');
      option.value = session.session_id;
      const date = new Date(session.last_activity);
      // Use the generated name if available, otherwise use the default format
      const displayName = session.name || `Chat ${session.session_id.slice(0, 8)}`;
      option.textContent = `${displayName} (${date.toLocaleTimeString()})`;
      chatSessionsSelect.appendChild(option);
    });

    // If we have a current session ID but it's not in the list, clear it
    if (currentSessionId && !sessions.some(s => s.session_id === currentSessionId)) {
      currentSessionId = null;
    }
    
    // Set dropdown value based on current session
    if (selectCurrentSession && currentSessionId) {
      chatSessionsSelect.value = currentSessionId;
    } else if (!selectCurrentSession && hasDefaultOption) {
      chatSessionsSelect.value = '';
    }
  } catch (error) {
    console.error('[Chat] Error refreshing chat sessions:', error);
  }
}

// Load chat history for a session
async function loadChatHistory(sessionId) {
  // Clear current chat messages regardless
  chatMessages.innerHTML = '';
  
  // If no sessionId or empty, we're done (new session with no history)
  if (!sessionId) return;
  
  try {
    const response = await window.electronAPI.listChatSessions();
    const session = response.sessions.find(s => s.session_id === sessionId);
    
    if (session && session.messages) {
      // Add each message to the chat
      session.messages.forEach(msg => {
        addMessage(msg.content, msg.role === 'user');
      });
    }
  } catch (error) {
    console.error('[Chat] Error loading chat history:', error);
  }
}

// Event listeners for chat session management
newChatBtn.addEventListener('click', async () => {
  await initializeChatSession();
});

chatSessionsSelect.addEventListener('change', async () => {
  const newSessionId = chatSessionsSelect.value;
  if (newSessionId !== currentSessionId) {
    currentSessionId = newSessionId;
    await loadChatHistory(currentSessionId);
  }
});

// Update sendMessage function to handle session creation
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  console.log('[Chat] Sending message:', message);

  // Add user message to chat
  addMessage(message, true);
  chatInput.value = '';

  try {
    // Get current function context
    const functionName = document.getElementById('function-name').textContent;
    const pseudocode = document.getElementById('toggle-pseudocode').checked ? monacoEditor.getValue() : '';
    const address = document.getElementById('function-address').textContent;

    // Initialize context object with required fields
    const context = {
      functionName: functionName,
      address: address
    };

    // Add pseudocode if enabled
    if (document.getElementById('toggle-pseudocode').checked) {
      context.pseudocode = pseudocode;
    }

    // Add assembly if enabled
    if (document.getElementById('toggle-assembly').checked) {
      const assemblyTable = document.querySelector('#assembly-table tbody');
      context.assembly = Array.from(assemblyTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          address: cells[0].textContent,
          offset: cells[1].textContent,
          bytes: cells[2].textContent,
          mnemonic: cells[3].textContent,
          operands: cells[4].textContent
        };
      });
    }

    // Add variables if enabled
    if (document.getElementById('toggle-variables').checked) {
      const variablesTable = document.querySelector('#variables-table tbody');
      context.variables = Array.from(variablesTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0].textContent,
          type: cells[1].textContent,
          size: cells[2].textContent,
          offset: cells[3].textContent
        };
      });
    }

    // Add xrefs if enabled
    if (document.getElementById('toggle-xrefs').checked) {
      const incomingXrefs = Array.from(document.querySelector('#incoming-xrefs-table tbody').querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0].textContent,
          address: cells[1].textContent,
          offset: cells[2].textContent,
          context: cells[3].textContent
        };
      });

      const outgoingXrefs = Array.from(document.querySelector('#outgoing-xrefs-table tbody').querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0].textContent,
          address: cells[1].textContent,
          offset: cells[2].textContent,
          context: cells[3].textContent
        };
      });

      context.xrefs = {
        incoming: incomingXrefs,
        outgoing: outgoingXrefs
      };
    }

    // Add strings if enabled
    if (document.getElementById('toggle-strings').checked) {
      const stringsTable = document.querySelector('#strings-table tbody');
      context.strings = Array.from(stringsTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          address: cells[0].textContent,
          value: cells[1].textContent,
          type: cells[2].textContent
        };
      });
    }

    // Add CFG if enabled - with debug logging
    console.log('[Chat] Debug - functionName:', functionName);
    console.log('[Chat] Debug - global currentFunction:', currentFunction);
    console.log('[Chat] Debug - CFG available:', currentFunction && currentFunction.cfg ? 'Yes' : 'No');
    if (document.getElementById('toggle-cfg').checked && currentFunction && currentFunction.cfg) {
      console.log('[Chat] Adding CFG data to context');
      context.cfg = {
        nodes: currentFunction.cfg.nodes.map(node => ({
          id: node.id,
          address: node.start_address,
          endAddress: node.end_address,
          instructions: node.instructions.slice(0, 5) // Limit to first 5 instructions to keep context size manageable
        })),
        edges: currentFunction.cfg.edges
      };
    } else {
      console.log('[Chat] CFG toggle:', document.getElementById('toggle-cfg').checked);
      console.log('[Chat] global currentFunction exists:', !!currentFunction);
      console.log('[Chat] currentFunction.cfg exists:', !!(currentFunction && currentFunction.cfg));
    }

    // Create a temporary message div for the generating state
    const tempMessageDiv = document.createElement('div');
    tempMessageDiv.className = 'message assistant generating';
    tempMessageDiv.textContent = 'Generating...';
    chatMessages.appendChild(tempMessageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let assistantReply = '';
    // Listen for chat chunks
    const chunkHandler = (event) => {
      if (!assistantReply) {
        // Clear the "Generating..." message on first chunk
        tempMessageDiv.className = 'message assistant';
        tempMessageDiv.textContent = '';
      }
      assistantReply += event.detail;
      if (window.marked && window.DOMPurify) {
        const rawHtml = window.marked.parse(assistantReply);
        const cleanHtml = window.DOMPurify.sanitize(rawHtml);
        tempMessageDiv.innerHTML = cleanHtml;
        if (window.hljs) {
          tempMessageDiv.querySelectorAll('pre code').forEach((block) => {
            window.hljs.highlightElement(block);
          });
        }
      } else {
        tempMessageDiv.textContent = assistantReply;
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    window.addEventListener('chat-chunk', chunkHandler);

    // Send to backend
    console.log('[Chat] Sending request to backend...');
    const response = await window.electronAPI.sendChatMessage({
      message,
      context,
      session_id: currentSessionId
    });

    // Remove the chunk handler
    window.removeEventListener('chat-chunk', chunkHandler);

    if (!response || !response.reply) {
      throw new Error('Invalid response format from backend');
    }

    // Update current session ID if it's a new session
    if (response.session_id && response.session_id !== currentSessionId) {
      currentSessionId = response.session_id;
      await refreshChatSessions();
      chatSessionsSelect.value = currentSessionId;
    }

    // Refresh chat sessions to get updated names
    await refreshChatSessions();

    // Final update with complete markdown
    if (window.marked && window.DOMPurify) {
      const rawHtml = window.marked.parse(response.reply);
      const cleanHtml = window.DOMPurify.sanitize(rawHtml);
      tempMessageDiv.innerHTML = cleanHtml;
      tempMessageDiv.className = 'message assistant';
      if (window.hljs) {
        tempMessageDiv.querySelectorAll('pre code').forEach((block) => {
          window.hljs.highlightElement(block);
        });
      }
    } else {
      tempMessageDiv.textContent = response.reply;
    }
  } catch (error) {
    console.error('[Chat] Error sending message:', error);
    console.error('[Chat] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    addMessage('Sorry, there was an error processing your request. Please check the console for details.', false);
  }
}

// Event listeners for chat
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

chatInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
  // Toggle at-max-height class for scrollbar
  if (this.scrollHeight >= 144) {
    this.classList.add('at-max-height');
  } else {
    this.classList.remove('at-max-height');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // Force Monaco editors to layout
  if (window.monacoEditor && window.monacoEditor.layout) window.monacoEditor.layout();
  if (window.assemblyEditor && window.assemblyEditor.layout) window.assemblyEditor.layout();
  // Dispatch a resize event to trigger any layout recalculations
  window.dispatchEvent(new Event('resize'));
  // Initialize chat session when the page loads
  initializeChatSession();
});

const deleteChatBtn = document.getElementById('delete-chat-btn');

deleteChatBtn.addEventListener('click', async () => {
  if (!currentSessionId) return; // Do nothing if no session
  try {
    await window.electronAPI.deleteChatSession(currentSessionId);
    currentSessionId = null;
    await refreshChatSessions(false); // Don't select any session
    chatMessages.innerHTML = '';
    chatSessionsSelect.value = '';
  } catch (error) {
    console.error('[Chat] Error deleting chat session:', error);
    // Optionally show a user-facing error
  }
}); 

// Function to update the Assembly tab with the function's assembly data
function updateAssemblyTab(func) {
  if (!func || !func.assembly) {
    const assemblyTableBody = document.querySelector('#assembly-table tbody');
    assemblyTableBody.innerHTML = '<tr><td colspan="5">No assembly available</td></tr>';
    return;
  }

  // Get the assembly table body
  const assemblyTableBody = document.querySelector('#assembly-table tbody');
  assemblyTableBody.innerHTML = '';
  
  // Add assembly instructions to the table
  func.assembly.forEach(instr => {
    const row = document.createElement('tr');
    const address = String(instr.address);
    const offset = instr.offset.toString(16).padStart(8, '0');
    const bytes = String(instr.bytes);
    const mnemonic = String(instr.mnemonic);
    const operands = instr.operands || '';
    row.innerHTML = `
      <td class="asm-address">${address}</td>
      <td class="asm-offset">${offset}</td>
      <td class="asm-bytes">${bytes}</td>
      <td class="asm-mnemonic">${mnemonic}</td>
      <td class="asm-operands">${operands}</td>
    `;
    assemblyTableBody.appendChild(row);
  });
}

// Function to update the Variables tab with the function's local variables
function updateVariablesTab(func) {
  if (!func || !func.local_variables) {
    const variablesTable = document.querySelector('#variables-table tbody');
    variablesTable.innerHTML = '<tr><td colspan="4">No local variables found</td></tr>';
    return;
  }

  // Get the variables table body
  const variablesTable = document.querySelector('#variables-table tbody');
  variablesTable.innerHTML = '';
  
  // Add variables to the table
  if (func.local_variables && func.local_variables.length > 0) {
    func.local_variables.forEach(variable => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = variable.name || 'unnamed';
      makeVariableEditable(nameCell, variable.name || 'unnamed');
      
      row.innerHTML = `
        <td></td>
        <td>${variable.type || 'unknown'}</td>
        <td>${variable.size || 'N/A'}</td>
        <td>${variable.offset || 'N/A'}</td>
      `;
      row.firstElementChild.replaceWith(nameCell);
      variablesTable.appendChild(row);
    });
  } else {
    variablesTable.innerHTML = '<tr><td colspan="4">No local variables found</td></tr>';
  }
}

// Function to update the Strings tab with the function's string references
function updateStringsTab(func) {
  if (!func || !func.local_strings) {
    const stringsTable = document.querySelector('#strings-table tbody');
    stringsTable.innerHTML = '<tr><td colspan="3">No local strings found</td></tr>';
    return;
  }

  // Get the strings table body
  const stringsTable = document.querySelector('#strings-table tbody');
  stringsTable.innerHTML = '';
  
  // Add strings to the table
  if (func.local_strings && func.local_strings.length > 0) {
    func.local_strings.forEach(str => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${str.address || 'N/A'}</td>
        <td>${str.value || 'N/A'}</td>
        <td>${str.type || 'string'}</td>
      `;
      stringsTable.appendChild(row);
    });
  } else {
    stringsTable.innerHTML = '<tr><td colspan="3">No local strings found</td></tr>';
  }
} 