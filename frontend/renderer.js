// Global variables
let monacoEditor = null;
let assemblyEditor = null;  // Add assembly editor variable
let functionsData = null;
let currentFunction = null;
let currentFilePath = null;
let originalBinaryName = null;  // Track the original binary name

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
const clearChatBtn = document.getElementById('clear-chat-btn');
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

// Display the selected function's information
function displayFunctionInfo(func) {
  currentFunction = func;
  window.currentFunction = func;
  
  // Update function info header
  functionNameEl.textContent = func.name;
  functionAddressEl.textContent = func.address;
  
  // Update pseudocode with variable decorations
  if (monacoEditor) {
    // Set the plain text pseudocode
    monacoEditor.setValue(func.pseudocode || '// No pseudocode available');
    
    // Add decorations for variables
    if (func.local_variables) {
      const decorations = [];
      const model = monacoEditor.getModel();
      
      func.local_variables.forEach(variable => {
        if (variable.name) {
          // Find all occurrences of the variable name
          const matches = model.findMatches(
            variable.name,
            false,
            false,
            true,
            null,
            true
          );
          
          // Create decorations for each match
          matches.forEach(match => {
            decorations.push({
              range: match.range,
              options: {
                inlineClassName: 'variable-name',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
              }
            });
          });
        }
      });
      
      // Apply the decorations
      monacoEditor.deltaDecorations([], decorations);
    }
  }

  // Update assembly view
  const assemblyTableBody = document.querySelector('#assembly-table tbody');
  if (assemblyTableBody) {
    assemblyTableBody.innerHTML = '';
    if (func.assembly && func.assembly.length > 0) {
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
    } else {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5">No assembly available</td>';
      assemblyTableBody.appendChild(row);
    }
  }
  
  // Update variables tab
  const variablesTable = document.querySelector('#variables-table tbody');
  variablesTable.innerHTML = '';
  
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
  
  // Update xrefs tab
  updateXRefsTab(func);
  
  // Update string references tab
  const stringsTable = document.querySelector('#strings-table tbody');
  stringsTable.innerHTML = '';
  
  if (func.local_strings && func.local_strings.length > 0) {
    func.local_strings.forEach(str => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${str.address || 'N/A'}</td>
        <td>${str.value || 'N/A'}</td>
        <td>${str.type || 'N/A'}</td>
      `;
      stringsTable.appendChild(row);
    });
  } else {
    stringsTable.innerHTML = '<tr><td colspan="3">No local strings found</td></tr>';
  }
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

// Initialize the application
function init() {
  initMonacoEditor();
  initFileHandling();
  checkRecentAnalyses();
  setupTabSwitching();
  
  // Set initial dropdown text
  chatSessionsSelect.innerHTML = '<option value="">Write a prompt to create a chat session</option>';
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

clearChatBtn.addEventListener('click', async () => {
  await clearCurrentChat();
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
    const currentFunction = document.getElementById('function-name').textContent;
    const pseudocode = monacoEditor.getValue();
    const address = document.getElementById('function-address').textContent;

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
      context: {
        functionName: currentFunction,
        pseudocode,
        address
      },
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