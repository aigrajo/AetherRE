// Global variables
let monacoEditor = null;
let functionsData = null;
let currentFunction = null;
let currentFilePath = null;

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
          currentFilePath = result.path;
          updateUIWithFile(result.filename);
          renderFunctionList(functionsData);
        }
      } else {
        // Load JSON file directly
        const result = await window.api.loadJsonFile(file.path);
        if (result) {
          functionsData = result.data;
          currentFilePath = result.path;
          updateUIWithFile(result.filename);
          renderFunctionList(functionsData);
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
  if (!functionsData) return;
  
  searchTerm = searchTerm.toLowerCase();
  const filteredFunctions = functionsData.filter(func => 
    func.name.toLowerCase().includes(searchTerm)
  );
  
  renderFunctionList(filteredFunctions);
}

// Display the selected function's information
function displayFunctionInfo(func) {
  currentFunction = func;
  
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
  const callsMadeList = document.getElementById('calls-made-list');
  const calledByList = document.getElementById('called-by-list');
  
  callsMadeList.innerHTML = '';
  calledByList.innerHTML = '';
  
  if (func.xrefs) {
    if (func.xrefs.calls_made && func.xrefs.calls_made.length > 0) {
      func.xrefs.calls_made.forEach(call => {
        const li = document.createElement('li');
        li.textContent = `${call.name} (${call.address})`;
        
        // Add click handler to jump to the called function
        li.addEventListener('click', () => {
          if (functionsData) {
            const calledFunc = functionsData.find(f => f.address === call.address);
            if (calledFunc) {
              const funcElement = document.querySelector(`.function-item[data-address="${call.address}"]`);
              if (funcElement) {
                funcElement.click();
                funcElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          }
        });
        
        callsMadeList.appendChild(li);
      });
    } else {
      callsMadeList.innerHTML = '<li>No calls made</li>';
    }
    
    if (func.xrefs.called_by && func.xrefs.called_by.length > 0) {
      func.xrefs.called_by.forEach(caller => {
        const li = document.createElement('li');
        li.textContent = `${caller.name} (${caller.address})`;
        
        // Add click handler to jump to the calling function
        li.addEventListener('click', () => {
          if (functionsData) {
            const callingFunc = functionsData.find(f => f.address === caller.address);
            if (callingFunc) {
              const funcElement = document.querySelector(`.function-item[data-address="${caller.address}"]`);
              if (funcElement) {
                funcElement.click();
                funcElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          }
        });
        
        calledByList.appendChild(li);
      });
    } else {
      calledByList.innerHTML = '<li>Not called by any function</li>';
    }
  }
  
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

// Event listeners
functionFilter.addEventListener('input', (event) => {
  filterFunctions(event.target.value);
});

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    switchTab(button.dataset.tab);
  });
});

// Initialize the application
function init() {
  initMonacoEditor();
  initFileHandling();
  checkRecentAnalyses();
}

// Start the application
init(); 