// Global variables
let monacoEditor = null;
let functionsData = null;
let currentFunction = null;
let currentFilePath = null;

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

// Initialize Monaco Editor
function initMonacoEditor() {
  // Load Monaco from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js';
  script.onload = () => {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
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
      
      // Resize editor when window resizes
      window.addEventListener('resize', () => {
        if (monacoEditor) {
          monacoEditor.layout();
        }
      });
    });
  };
  document.head.appendChild(script);
}

// Initialize file handling
function initFileHandling() {
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
        // Show progress bar for binary analysis
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting analysis...';

        // Start binary analysis
        const result = await window.api.analyzeBinary(file.path, (progress) => {
          // Update progress bar
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `Analyzing binary... ${progress}%`;
        });

        // Hide progress bar
        progressContainer.style.display = 'none';
        
        if (result) {
          functionsData = result.data;
          window.currentData = functionsData;
          currentFilePath = result.path;
          updateUIWithFile(result.filename);
          renderFunctionList(functionsData.functions);
        }
      } else {
        // Load JSON file directly
        const result = await window.api.loadJsonFile(file.path);
        if (result) {
          functionsData = result.data;
          window.currentData = functionsData;
          currentFilePath = result.path;
          updateUIWithFile(result.filename);
          renderFunctionList(functionsData.functions);
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      progressContainer.style.display = 'none';
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
  document.title = `AetherRE - ${filename || 'No File Loaded'}`;
  
  // Only update the app title if we're displaying a file
  if (filename) {
    appTitle.innerHTML = `AetherRE <span class="current-file">${filename}</span>`;
  }
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
  window.currentFunction = func;  // Ensure it's also set on window
  
  // Update function info header
  functionNameEl.textContent = func.name;
  functionAddressEl.textContent = func.address;
  
  // Update pseudocode
  if (monacoEditor) {
    monacoEditor.setValue(func.pseudocode || '// No pseudocode available');
  }
  
  // Update variables tab
  const variablesTable = document.querySelector('#variables-table tbody');
  variablesTable.innerHTML = '';
  
  if (func.variables && func.variables.length > 0) {
    func.variables.forEach(variable => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${variable.name}</td>
        <td>${variable.dataType}</td>
        <td>${variable.isParameter ? 'Yes' : 'No'}</td>
        <td>${variable.isStackVariable ? 'Yes' : 'No'}</td>
      `;
      variablesTable.appendChild(row);
    });
  } else {
    variablesTable.innerHTML = '<tr><td colspan="4">No variables found</td></tr>';
  }
  
  // Update xrefs tab
  updateXRefsTab(func);
  
  // Update string references tab
  const stringsTable = document.querySelector('#strings-table tbody');
  stringsTable.innerHTML = '';
  
  if (func.string_refs && func.string_refs.length > 0) {
    func.string_refs.forEach(str => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${str.address}</td>
        <td>${str.value}</td>
      `;
      stringsTable.appendChild(row);
    });
  } else {
    stringsTable.innerHTML = '<tr><td colspan="2">No string references found</td></tr>';
  }
}

// Tab switching
function switchTab(tabName) {
  tabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  
  tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}-tab`);
  });
  
  // Refresh editor layout when switching to pseudocode tab
  if (tabName === 'pseudocode' && monacoEditor) {
    setTimeout(() => monacoEditor.layout(), 0);
  }
}

// Fix tab switching
// First create the wrapped version
const originalSwitchTab = switchTab;
window.switchTab = function(tabName) {
  console.log('Switching to tab:', tabName);
  // Use direct DOM queries to update tab highlighting
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}-tab`);
  });
  
  // Refresh editor layout when switching to pseudocode tab
  if (tabName === 'pseudocode' && monacoEditor) {
    setTimeout(() => monacoEditor.layout(), 0);
  }
  
  // If switching to xrefs tab, force update
  if (tabName === 'xrefs' && window.currentFunction) {
    console.log('Force updating xrefs tab for:', window.currentFunction);
    updateXRefsTab(window.currentFunction);
  }
};

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
document.getElementById('xref-type-filter').addEventListener('change', () => {
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
    
    // Get the tables
    const incomingTable = document.getElementById('incoming-xrefs-table').getElementsByTagName('tbody')[0];
    const outgoingTable = document.getElementById('outgoing-xrefs-table').getElementsByTagName('tbody')[0];
    
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
    const typeFilter = document.getElementById('xref-type-filter').value;
    const sortBy = document.getElementById('xref-sort-by').value;
    
    // Filter references
    let filteredIncoming = incomingRefs.filter(ref => {
        if (directionFilter !== 'all' && directionFilter !== 'incoming') return false;
        if (typeFilter !== 'all' && ref.type !== typeFilter) return false;
        return true;
    });
    
    let filteredOutgoing = outgoingRefs.filter(ref => {
        if (directionFilter !== 'all' && directionFilter !== 'outgoing') return false;
        if (typeFilter !== 'all' && ref.type !== typeFilter) return false;
        return true;
    });
    
    // Group references by function
    const groupedIncoming = groupReferencesByFunction(filteredIncoming);
    const groupedOutgoing = groupReferencesByFunction(filteredOutgoing);
    
    // Sort references
    const sortReferences = (refs, grouped) => {
        try {
            return refs.sort((a, b) => {
                const aAddr = a.source_func || a.target_func;
                const bAddr = b.source_func || b.target_func;
                
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
    
    filteredIncoming = sortReferences(filteredIncoming, groupedIncoming);
    filteredOutgoing = sortReferences(filteredOutgoing, groupedOutgoing);
    
    // Populate tables
    if (filteredIncoming.length === 0) {
        incomingTable.innerHTML = '<tr><td colspan="5">No incoming references found</td></tr>';
    } else {
        let lastAddr = null;
        filteredIncoming.forEach(ref => {
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
    
    if (filteredOutgoing.length === 0) {
        outgoingTable.innerHTML = '<tr><td colspan="5">No outgoing references found</td></tr>';
    } else {
        let lastAddr = null;
        filteredOutgoing.forEach(ref => {
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

// Initialize the application
function init() {
  initMonacoEditor();
  initFileHandling();
  checkRecentAnalyses();
  setupTabSwitching();
}

// Setup tab switching with our wrapped version
function setupTabSwitching() {
  // Create wrapped version of switchTab
  const originalSwitchTab = switchTab;
  window.switchTab = function(tabName) {
    console.log('Switching to tab:', tabName);
    // Directly update DOM
    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });
    
    // Refresh editor layout when switching to pseudocode tab
    if (tabName === 'pseudocode' && monacoEditor) {
      setTimeout(() => monacoEditor.layout(), 0);
    }
    
    // If switching to xrefs tab, force update
    if (tabName === 'xrefs' && window.currentFunction) {
      console.log('Force updating xrefs tab for:', window.currentFunction);
      updateXRefsTab(window.currentFunction);
    }
  };
  
  // Replace all tab button listeners
  document.querySelectorAll('.tab-button').forEach(button => {
    // Clone and replace to remove old listeners
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add new listener with wrapped function
    newButton.addEventListener('click', () => {
      window.switchTab(newButton.dataset.tab);
    });
  });
}

// Start the application
init(); 