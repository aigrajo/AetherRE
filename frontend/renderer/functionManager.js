import { state } from './core.js';
import { switchTab } from './tabManager.js';
import { updateAssemblyTab, updateXRefsTab, updateVariablesTab, updateStringsTab, updateCFGTab } from './tabManager.js';
import { makeFunctionNameEditable } from './functionRenamer.js';

// Debugging
const DEBUG = true;
function debugLog(...args) {
  if (DEBUG) {
    console.log('[FunctionManager]', ...args);
  }
}

// Render the function list
export function renderFunctionList(functions) {
  debugLog(`Rendering function list with ${functions ? functions.length : 0} functions`);
  const functionList = document.getElementById('function-list');
  
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
  
  // Make renderFunctionList available globally for direct calls
  window.renderFunctionList = renderFunctionList;
}

// Filter functions based on search term
export function filterFunctions(searchTerm) {
  if (!state.functionsData || !state.functionsData.functions) return;
  
  searchTerm = searchTerm.toLowerCase();
  const filteredFunctions = state.functionsData.functions.filter(func => 
    func.name.toLowerCase().includes(searchTerm)
  );
  
  renderFunctionList(filteredFunctions);
}

// Function to display function info
export function displayFunctionInfo(func) {
  if (!func) {
    debugLog("displayFunctionInfo called with no function");
    return;
  }
  
  debugLog(`Displaying function info for: ${func.name} (${func.address})`);
  
  state.currentFunction = func;
  window.currentFunction = func; // For compatibility with existing code
  
  // Update function name and address
  const functionNameEl = document.getElementById('function-name');
  if (functionNameEl) {
    functionNameEl.textContent = func.name;
    makeFunctionNameEditable(functionNameEl, func.name);
  }
  
  const functionAddressEl = document.getElementById('function-address');
  if (functionAddressEl) {
    functionAddressEl.textContent = func.address;
  }
  
  // Update pseudocode
  if (state.monacoEditor) {
    const pseudocode = func.pseudocode || '// No pseudocode available';
    debugLog(`Updating Monaco editor with pseudocode (${pseudocode.length} chars)`);
    
    // Ensure we're updating the model directly
    const model = state.monacoEditor.getModel();
    if (model) {
      // Use setValue to replace the entire content
      model.setValue(pseudocode);
      
      // Force layout update
      state.monacoEditor.layout();
    } else {
      // Fallback if model isn't available
      state.monacoEditor.setValue(pseudocode);
    }
  }

  // Update tabs based on data availability
  updateAssemblyTab(func);
  updateXRefsTab(func);
  updateVariablesTab(func);
  updateStringsTab(func);
  updateCFGTab(func);
  
  // Dispatch event for TagNote panel
  debugLog(`Dispatching function-selected event for ${func.name} (${func.address})`);
  window.dispatchEvent(new CustomEvent('function-selected', {
    detail: {
      functionId: func.address,
      functionName: func.name
    }
  }));
}

// Setup function filter event listener
export function setupFunctionFilter() {
  debugLog("Setting up function filter");
  const functionFilter = document.getElementById('function-filter');
  functionFilter.addEventListener('input', (event) => {
    filterFunctions(event.target.value);
  });
} 