import { state } from './core.js';
import { recordAction } from './historyManager.js';
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
    
    // Record action for local history (simplified)
    recordSimpleAction(oldName, newName, result.operation_id);
    
    return true;
    
  } catch (error) {
    console.error('Error during function rename:', error);
    window.showErrorModal(`Rename failed: ${error.message}`);
    return false;
  }
}

// Apply backend updates to frontend state
function updateStateFromBackendResult(result) {
  console.log('Applying backend updates to frontend state');
  
  // Update current function with backend result
  if (result.updated_current_function) {
    state.currentFunction = result.updated_current_function;
    console.log(`Updated current function name to: ${state.currentFunction.name}`);
  }
  
  // Update functions data with backend result
  if (result.updated_functions_data) {
    state.functionsData = result.updated_functions_data;
    console.log('Updated functions data from backend');
  }
  
  // Update Monaco editor with new pseudocode
  if (state.currentFunction.pseudocode) {
    updateMonacoEditorContent(state.currentFunction.pseudocode);
  }
  
  // Update function name display
  const functionNameEl = document.getElementById('function-name');
  if (functionNameEl && state.currentFunction.name) {
    functionNameEl.textContent = state.currentFunction.name;
    functionNameEl.setAttribute('data-function-name', state.currentFunction.name);
    console.log(`Updated function name display to: ${state.currentFunction.name}`);
  }
}

// Simplified action recording for local undo/redo
function recordSimpleAction(oldName, newName, operationId) {
  recordAction({
    type: 'rename_function_backend',
    oldName,
    newName,
    operationId,
    sessionId,
    undo: async () => {
      console.log(`Undoing backend function rename: "${newName}" -> "${oldName}"`);
      try {
        const result = await apiService.undoFunctionOperation(sessionId, operationId);
        if (result.success && result.restored_state) {
          applyRestoredState(result.restored_state);
        } else {
          console.error('Backend undo failed:', result.error);
          window.showErrorModal('Undo failed: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error during undo:', error);
        window.showErrorModal('Undo failed: ' + error.message);
      }
    },
    redo: async () => {
      console.log(`Redoing backend function rename: "${oldName}" -> "${newName}"`);
      try {
        const result = await apiService.redoFunctionOperation(sessionId, operationId);
        if (result.success && result.restored_state) {
          applyRestoredState(result.restored_state);
        } else {
          console.error('Backend redo failed:', result.error);
          window.showErrorModal('Redo failed: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error during redo:', error);
        window.showErrorModal('Redo failed: ' + error.message);
      }
    }
  });
}

// Apply restored state from backend undo/redo operations
function applyRestoredState(restoredState) {
  console.log('Applying restored state from backend');
  
  if (restoredState.current_function) {
    state.currentFunction = restoredState.current_function;
  }
  
  if (restoredState.functions_data) {
    state.functionsData = restoredState.functions_data;
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