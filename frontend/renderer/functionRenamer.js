import { state } from './core.js';
import { apiService } from './apiService.js';

// Global flag to track focus issues
let focusIssueDetected = false;

// Generate a simple session ID for history tracking
let sessionId = generateSessionId();

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Function to detect and fix focus issues
function detectAndFixFocusIssues() {
  console.log("Focus debugging:");
  console.log("- document.activeElement:", document.activeElement);
  console.log("- document.hasFocus():", document.hasFocus());
  console.log("- document.body.contains(activeElement):", document.body.contains(document.activeElement));
  
  // Check if we can focus a test element
  const testDiv = document.createElement('div');
  testDiv.tabIndex = -1;
  testDiv.style.position = 'absolute';
  testDiv.style.left = '-9999px';
  document.body.appendChild(testDiv);
  
  try {
    testDiv.focus();
    const canFocus = document.activeElement === testDiv;
    console.log("- Can focus test element:", canFocus);
    
    if (!canFocus) {
      console.warn("Focus issue detected! Attempting to restore focus...");
      focusIssueDetected = true;
      
      // Try to restore focus by clicking the window
      if (window.focus) {
        window.focus();
      }
      
      // Force focus on the body
      document.body.focus();
      
      // Dispatch a focus event
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('focus'));
    }
  } catch (error) {
    console.error("Error testing focus:", error);
  } finally {
    document.body.removeChild(testDiv);
  }
}

// Add a manual focus restore function accessible from console
window.debugFocusIssue = detectAndFixFocusIssues;
window.restoreFocus = function() {
  console.log("Manually restoring focus...");
  if (window.focus) window.focus();
  document.body.focus();
  setTimeout(() => document.body.click(), 10);
};

// Simplified function to rename a function using comprehensive backend service
export async function renameFunction(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return false;
  
  console.log(`Attempting to rename function from "${oldName}" to "${newName}"`);
  
  // Capture old state before making changes
  const oldState = {
    pseudocode: state.currentFunction.pseudocode,
    currentFunction: JSON.parse(JSON.stringify(state.currentFunction)),
    functionsData: JSON.parse(JSON.stringify(state.functionsData || {}))
  };
  
  try {
    // Call comprehensive backend service
    const result = await apiService.renameFunction(
      oldName,
      newName,
      state.currentFunction,
      state.functionsData || {},
      sessionId
    );
    
    if (!result.success) {
      console.error(`Cannot rename to "${newName}": ${result.error}`);
      window.showErrorModal(result.error);
      return false;
    }
    
    console.log('Backend rename completed successfully');
    
    // Apply the updates returned from backend
    updateStateFromBackendResult(result);
    
    // Capture new state after making changes
    const newState = {
      pseudocode: state.currentFunction.pseudocode,
      currentFunction: JSON.parse(JSON.stringify(state.currentFunction)),
      functionsData: JSON.parse(JSON.stringify(state.functionsData || {}))
    };
    
    // Record in unified history
    await recordFunctionRename(oldName, newName, oldState, newState);
    
    return true;
    
  } catch (error) {
    console.error('Error during function rename:', error);
    window.showErrorModal(`Rename failed: ${error.message}`);
    return false;
  }
}

// Apply backend updates to frontend state
function updateStateFromBackendResult(result) {
  if (result.updated_current_function) {
    state.currentFunction = result.updated_current_function;
    console.log('Updated current function state:', state.currentFunction);
  }
  
  if (result.updated_functions_data) {
    state.functionsData = result.updated_functions_data;
    console.log('Updated functions data');
  }
  
  // Update function name display
  if (state.currentFunction && state.currentFunction.name) {
    const functionNameEl = document.getElementById('function-name');
    if (functionNameEl) {
      functionNameEl.textContent = state.currentFunction.name;
      functionNameEl.setAttribute('data-function-name', state.currentFunction.name);
      console.log(`Updated function name display to: ${state.currentFunction.name}`);
    }
  }
  
  // Update Monaco editor content if available
  if (state.currentFunction && state.currentFunction.pseudocode) {
    updateMonacoEditorContent(state.currentFunction.pseudocode);
  }
  
  // Update function list to reflect the rename
  if (state.functionsData && state.functionsData.functions) {
    console.log('Refreshing function list after rename');
    
    // Use dynamic import to avoid circular dependency
    import('./functionManager.js').then(({ renderFunctionList, filterFunctions }) => {
      // Check if there's an active filter and preserve it
      const functionFilter = document.getElementById('function-filter');
      const filterValue = functionFilter ? functionFilter.value.trim() : '';
      
      if (filterValue) {
        console.log(`Applying existing filter "${filterValue}" after rename`);
        filterFunctions(filterValue);
      } else {
        renderFunctionList(state.functionsData.functions);
      }
      
      // Re-select the current function in the list
      if (state.currentFunction && state.currentFunction.address) {
        setTimeout(() => {
          const functionListItems = document.querySelectorAll('.function-item');
          functionListItems.forEach(item => {
            if (item.dataset.address === state.currentFunction.address) {
              item.classList.add('selected');
              console.log(`Re-selected function in list: ${state.currentFunction.name}`);
            } else {
              item.classList.remove('selected');
            }
          });
        }, 10); // Small delay to ensure list is rendered
      }
    }).catch(error => {
      console.error('Error refreshing function list:', error);
    });
  }
}

// Record function rename operation in unified history
async function recordFunctionRename(oldName, newName, oldState, newState) {
  const { recordAction } = await import('./historyManager.js');
  
  console.log('Recording function rename in history:');
  console.log('  oldName:', oldName);
  console.log('  newName:', newName);
  console.log('  oldState.pseudocode length:', oldState.pseudocode ? oldState.pseudocode.length : 'null');
  console.log('  newState.pseudocode length:', newState.pseudocode ? newState.pseudocode.length : 'null');
  console.log('  oldState.currentFunction.name:', oldState.currentFunction ? oldState.currentFunction.name : 'null');
  console.log('  newState.currentFunction.name:', newState.currentFunction ? newState.currentFunction.name : 'null');
  
  await recordAction({
    type: 'rename_function',
    operationData: {
      old_name: oldName,
      new_name: newName,
      function_id: state.currentFunction?.address || state.currentFunction?.id
    },
    oldState: {
      name: oldName,
      pseudocode: oldState.pseudocode,
      currentFunction: oldState.currentFunction,
      functionsData: oldState.functionsData
    },
    newState: {
      name: newName, 
      pseudocode: newState.pseudocode,
      currentFunction: newState.currentFunction,
      functionsData: newState.functionsData
    },
    metadata: {
      timestamp: new Date().toISOString(),
      operation_type: 'function_rename'
    }
  });
}

// Apply restored state from backend undo/redo operations
export function applyRestoredState(restoredState) {
  console.log('Applying restored state from backend');
  
  // Handle both snake_case (from backend) and camelCase (from frontend) formats
  const currentFunction = restoredState.current_function || restoredState.currentFunction;
  const functionsData = restoredState.functions_data || restoredState.functionsData;
  
  if (currentFunction) {
    state.currentFunction = currentFunction;
    console.log('Updated current function from restored state:', currentFunction.name);
  }
  
  if (functionsData) {
    state.functionsData = functionsData;
    console.log('Updated functions data from restored state');
  }
  
  // Update Monaco editor
  if (state.currentFunction && state.currentFunction.pseudocode) {
    updateMonacoEditorContent(state.currentFunction.pseudocode);
  }
  
  // Update function name display
  const functionNameEl = document.getElementById('function-name');
  if (functionNameEl && state.currentFunction && state.currentFunction.name) {
    functionNameEl.textContent = state.currentFunction.name;
    functionNameEl.setAttribute('data-function-name', state.currentFunction.name);
  }
  
  // Update function list to reflect the restored state
  if (state.functionsData && state.functionsData.functions) {
    console.log('Refreshing function list after state restore');
    
    // Use dynamic import to avoid circular dependency
    import('./functionManager.js').then(({ renderFunctionList, filterFunctions }) => {
      // Check if there's an active filter and preserve it
      const functionFilter = document.getElementById('function-filter');
      const filterValue = functionFilter ? functionFilter.value.trim() : '';
      
      if (filterValue) {
        console.log(`Applying existing filter "${filterValue}" after restore`);
        filterFunctions(filterValue);
      } else {
        renderFunctionList(state.functionsData.functions);
      }
      
      // Re-select the current function in the list
      if (state.currentFunction && state.currentFunction.address) {
        setTimeout(() => {
          const functionListItems = document.querySelectorAll('.function-item');
          functionListItems.forEach(item => {
            if (item.dataset.address === state.currentFunction.address) {
              item.classList.add('selected');
              console.log(`Re-selected function in list after restore: ${state.currentFunction.name}`);
            } else {
              item.classList.remove('selected');
            }
          });
        }, 10); // Small delay to ensure list is rendered
      }
    }).catch(error => {
      console.error('Error refreshing function list after restore:', error);
    });
  }
}

/**
 * Helper function to directly update the Monaco editor content
 * This helps ensure the editor always reflects the current state
 */
function updateMonacoEditorContent(content) {
  // Use global function if available (defined in editor.js)
  if (window.updateMonacoEditorContent) {
    window.updateMonacoEditorContent(content);
    return;
  }
  
  // Fallback to direct update if global function not available
  if (state.monacoEditor && content) {
    const model = state.monacoEditor.getModel();
    if (model) {
      // Use setValue to replace the entire content
      model.setValue(content);
      
      // Force a layout update immediately
      state.monacoEditor.layout();
    }
  }
}

// Function to make a function name editable (simplified UI logic only)
export function makeFunctionNameEditable(element, functionName) {
  // Always use the current function name from state if available
  const currentName = state.currentFunction ? state.currentFunction.name : functionName;
  
  console.log(`Making function name editable: UI name=${functionName}, Current state name=${currentName}`);
  
  // Clean up any existing inputs
  document.querySelectorAll('.function-rename-input, .variable-rename-input').forEach(el => {
    el.blur();
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Set basic editable properties
  element.textContent = currentName;
  element.classList.add('editable');
  element.title = 'Click to rename function';
  element.setAttribute('data-function-name', currentName);
  
  // Clean up any existing handlers
  element.removeEventListener('click', element.renameClickHandler);
  
  // Simplified click handler
  element.renameClickHandler = function startEditMode(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Stop if already editing
    if (document.querySelector('.function-rename-input, .variable-rename-input')) {
      return;
    }
    
    const originalName = element.getAttribute('data-function-name') || element.textContent;
    console.log(`Starting edit for function name: ${originalName}`);
    
    // Create input for editing
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalName;
    input.className = 'function-rename-input';
    
    // Clear and append
    element.innerHTML = '';
    element.appendChild(input);
    
    let editInProgress = false;
    
    const completeEdit = async (name) => {
      if (editInProgress) return;
      editInProgress = true;
      
      if (name && name !== originalName) {
        // Attempt the rename using simplified backend call
        try {
          console.log(`Calling renameFunction with: "${originalName}" -> "${name}"`);
          const success = await renameFunction(originalName, name);
          
          if (success === false) {
            // Validation failed - recreate input
            console.log("Validation failed, recreating input element");
            
            input.removeEventListener('blur', blurHandler);
            
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
            
            element.textContent = originalName;
            editInProgress = false;
            
            setTimeout(() => {
              element.click();
            }, 100);
            
            return;
          } else {
            // Success - remove input and update display
            console.log("Rename succeeded, removing input");
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
            element.textContent = name;
            element.setAttribute('data-function-name', name);
          }
        } catch (error) {
          console.error("Error during rename:", error);
          window.showErrorModal("An error occurred while renaming. Please try again.");
          
          input.removeEventListener('blur', blurHandler);
          
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
          element.textContent = originalName;
          editInProgress = false;
          
          setTimeout(() => {
            element.click();
          }, 100);
          return;
        }
      } else {
        // No change - remove input and reset
        console.log("No change, removing input");
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
        element.textContent = originalName;
      }
    };
    
    // Select all after a short delay
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
    
    // Handle blur
    const blurHandler = function(e) {
      if (document.activeElement === document.body) {
        console.log("Blur due to modal, ignoring");
        return;
      }
      
      if (!editInProgress) {
        console.log("Calling completeEdit from blur handler");
        completeEdit(this.value.trim());
      }
    };
    input.addEventListener('blur', blurHandler);
    
    // Handle keyboard events
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        console.log("Enter key pressed, calling completeEdit");
        completeEdit(this.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        editInProgress = true;
        console.log("Escape key pressed, removing input");
        
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
        element.textContent = originalName;
      }
    });
  };
  
  // Attach the handler
  element.addEventListener('click', element.renameClickHandler);
} 