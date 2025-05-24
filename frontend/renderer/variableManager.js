import { state } from './core.js';
import { recordAction } from './historyManager.js';
import { apiService } from './apiService.js';

// Generate a simple session ID for history tracking (shared with function renamer)
let sessionId = generateSessionId();

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Simplified function to rename a variable using comprehensive backend service
export async function renameVariable(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return false;
  
  console.log(`Attempting to rename variable from "${oldName}" to "${newName}"`);
  
  try {
    // Call comprehensive backend service
    const result = await apiService.renameVariable(
      oldName,
      newName,
      state.currentFunction,
      sessionId
    );
    
    if (!result.success) {
      console.error(`Cannot rename to "${newName}": ${result.error}`);
      window.showErrorModal(result.error);
      return false;
    }
    
    console.log('Backend variable rename completed successfully');
    
    // Apply the updates returned from backend
    updateStateFromBackendResult(result);
    
    // Record action for local history (simplified)
    recordSimpleAction(oldName, newName, result.operation_id);
    
    return true;
    
  } catch (error) {
    console.error('Error during variable rename:', error);
    window.showErrorModal(`Variable rename failed: ${error.message}`);
    return false;
  }
}

// Apply backend updates to frontend state
function updateStateFromBackendResult(result) {
  console.log('Applying backend updates to frontend state');
  
  // Update current function with backend result
  if (result.updated_current_function) {
    state.currentFunction = result.updated_current_function;
    console.log(`Updated current function with new variable data`);
  }
  
  // Update Monaco editor with new pseudocode
  if (state.currentFunction.pseudocode) {
    updateMonacoEditorContent(state.currentFunction.pseudocode);
  }
  
  // Update variables table
  updateVariablesTable();
}

// Simplified action recording for local undo/redo
function recordSimpleAction(oldName, newName, operationId) {
  recordAction({
    type: 'rename_variable_backend',
    oldName,
    newName,
    operationId,
    sessionId,
    undo: async () => {
      console.log(`Undoing backend variable rename: "${newName}" -> "${oldName}"`);
      try {
        const result = await apiService.undoVariableOperation(sessionId, operationId);
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
      console.log(`Redoing backend variable rename: "${oldName}" -> "${newName}"`);
      try {
        const result = await apiService.redoVariableOperation(sessionId, operationId);
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
  
  // Update Monaco editor
  if (state.currentFunction && state.currentFunction.pseudocode) {
    updateMonacoEditorContent(state.currentFunction.pseudocode);
  }
  
  // Update variables table
  updateVariablesTable();
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

/**
 * Update the variables table with current function data
 */
function updateVariablesTable() {
  const variablesTable = document.querySelector('#variables-table tbody');
  if (variablesTable && state.currentFunction && state.currentFunction.local_variables) {
    variablesTable.innerHTML = '';
    
    state.currentFunction.local_variables.forEach(variable => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = variable.name || 'unnamed';
      nameCell.classList.add('editable');
      nameCell.setAttribute('data-variable-name', variable.name || 'unnamed');
      nameCell.title = 'Click to rename variable';
      
      row.innerHTML = `
        <td></td>
        <td>${variable.type || 'unknown'}</td>
        <td>${variable.size || 'N/A'}</td>
        <td>${variable.offset || 'N/A'}</td>
      `;
      row.firstElementChild.replaceWith(nameCell);
      variablesTable.appendChild(row);
      
      // Make the name cell editable
      makeVariableEditable(nameCell, variable.name || 'unnamed');
    });
  }
}

// Function to make a variable name editable (simplified UI logic only)
export function makeVariableEditable(element, variableName) {
  // Always use the current variable name from the element
  const currentName = element.getAttribute('data-variable-name') || variableName;
  
  console.log(`Making variable name editable: ${currentName}`);
  
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
  element.title = 'Click to rename variable';
  element.setAttribute('data-variable-name', currentName);
  
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
    
    const originalName = element.getAttribute('data-variable-name') || element.textContent;
    console.log(`Starting edit for variable name: ${originalName}`);
    
    // Create input for editing
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalName;
    input.className = 'variable-rename-input';
    
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
          console.log(`Calling renameVariable with: "${originalName}" -> "${name}"`);
          const success = await renameVariable(originalName, name);
          
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
            console.log("Variable rename succeeded, removing input");
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
            element.textContent = name;
            element.setAttribute('data-variable-name', name);
          }
        } catch (error) {
          console.error("Error during variable rename:", error);
          window.showErrorModal("An error occurred while renaming variable. Please try again.");
          
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