import { state } from './core.js';
import { recordAction } from './historyManager.js';
import { apiService } from './apiService.js';

// Function to rename a variable
export async function renameVariable(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return false;
  
  console.log(`Attempting to rename variable from "${oldName}" to "${newName}"`);
  
  // Use backend validation instead of frontend validation
  return await validateAndRenameVariable(oldName, newName);
}

// New function to validate and rename using backend service
async function validateAndRenameVariable(oldName, newName) {
  try {
    // Ensure we have valid current function data
    if (!state.currentFunction) {
      throw new Error("No current function selected");
    }
    
    console.log(`Current function for variable rename: ${state.currentFunction.name || 'unnamed'}`);
    console.log(`Local variables available:`, state.currentFunction.local_variables ? state.currentFunction.local_variables.length : 0);
    
    // Call backend validation service using our API service
    const validationResult = await apiService.validateVariableName(
      oldName,
      newName,
      state.currentFunction.local_variables || [],
      state.currentFunction.pseudocode
    );
    
    if (!validationResult.is_valid) {
      console.error(`Cannot rename to "${newName}": ${validationResult.error_message}`);
      window.showErrorModal(validationResult.error_message);
      return false;
    }
    
    // Validation passed, perform the rename
    return performVariableRename(oldName, newName);
    
  } catch (error) {
    console.error('Error during validation:', error);
    window.showErrorModal(`Validation failed: ${error.message}`);
    return false;
  }
}

// Function to perform the actual rename after validation passes
function performVariableRename(oldName, newName) {
  console.log(`Performing variable rename from "${oldName}" to "${newName}"`);
  
  // Get the function identifier (use address as primary, fallback to id)
  const functionId = state.currentFunction.address || state.currentFunction.id;
  
  // Store old state for history
  const oldState = {
    name: oldName,
    functionId: functionId,
    functionName: state.currentFunction.name,
    pseudocode: state.currentFunction.pseudocode,
    localVariables: state.currentFunction.local_variables ? JSON.parse(JSON.stringify(state.currentFunction.local_variables)) : null
  };
  
  // Update in local_variables
  if (state.currentFunction.local_variables) {
    state.currentFunction.local_variables.forEach(variable => {
      if (variable.name === oldName) {
        // Track the original name if this is the first rename
        if (!variable.originalName) {
          variable.originalName = oldName;
        }
        variable.name = newName;
      }
    });
  }
  
  // Update in pseudocode - CRITICAL PATH
  let updatedPseudocode = false;
  if (state.currentFunction.pseudocode) {
    try {
      // Create a regex that matches the variable name as a whole word
      const regex = new RegExp(`\\b${oldName}\\b`, 'g');
      const newPseudocode = state.currentFunction.pseudocode.replace(regex, newName);
      
      // Only update if changes were actually made
      if (newPseudocode !== state.currentFunction.pseudocode) {
        state.currentFunction.pseudocode = newPseudocode;
        updatedPseudocode = true;
        console.log(`Updated pseudocode with new variable name "${newName}"`);
      } else {
        console.log(`No matches found for "${oldName}" in pseudocode, using exact replacement`);
        // Fallback to direct string replacement if regex didn't match
        state.currentFunction.pseudocode = state.currentFunction.pseudocode.split(oldName).join(newName);
      }
      
      // Update Monaco editor immediately
      if (window.updateMonacoEditorContent) {
        window.updateMonacoEditorContent(state.currentFunction.pseudocode);
      } else {
        updateMonacoEditorContent(state.currentFunction.pseudocode);
      }
    } catch (error) {
      console.error(`Error updating pseudocode:`, error);
    }
  }
  
  // Store new state for history
  const newState = {
    name: newName,
    functionId: functionId,
    functionName: state.currentFunction.name,
    pseudocode: state.currentFunction.pseudocode,
    localVariables: state.currentFunction.local_variables ? JSON.parse(JSON.stringify(state.currentFunction.local_variables)) : null
  };
  
  // Log whether pseudocode was updated
  console.log(`Pseudocode updated: ${updatedPseudocode}, old length: ${oldState.pseudocode.length}, new length: ${newState.pseudocode.length}`);
  
  // IMPORTANT: Update function name display after variable rename
  const functionNameEl = document.getElementById('function-name');
  if (functionNameEl && state.currentFunction.name) {
    functionNameEl.textContent = state.currentFunction.name;
    console.log(`Updated function name display to: ${state.currentFunction.name}`);
  }
  
  // Record action for undo/redo
  recordAction({
    type: 'rename_variable',
    oldState,
    newState,
    undo: () => {
      console.log(`Undoing rename of variable from "${newName}" to "${oldState.name}"`);
      
      // Check if we're still on the same function (use address/id)
      const currentFunctionId = state.currentFunction?.address || state.currentFunction?.id;
      if (state.currentFunction && currentFunctionId === oldState.functionId) {
        // 1. Restore the old variable name
        if (state.currentFunction.local_variables) {
          state.currentFunction.local_variables.forEach(variable => {
            if (variable.name === newState.name) {
              variable.name = oldState.name;
            }
          });
        }
        
        // 2. Restore pseudocode - IMPORTANT: use the stored pseudocode rather than trying to do a replace
        state.currentFunction.pseudocode = oldState.pseudocode;
        
        // 3. Update Monaco editor immediately with the old pseudocode
        if (window.updateMonacoEditorContent) {
          window.updateMonacoEditorContent(oldState.pseudocode);
        } else {
          updateMonacoEditorContent(oldState.pseudocode);
        }
        
        // 4. Update function name display
        const functionNameEl = document.getElementById('function-name');
        if (functionNameEl && state.currentFunction.name) {
          functionNameEl.textContent = state.currentFunction.name;
        }
        
        // 5. Update variables table
        const variablesTable = document.querySelector('#variables-table tbody');
        if (variablesTable && state.currentFunction.local_variables) {
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
            
            // IMPORTANT: Make the name cell editable by attaching click handler
            makeVariableEditable(nameCell, variable.name || 'unnamed');
          });
        }
      }
    },
    redo: () => {
      console.log(`Redoing rename of variable from "${oldState.name}" to "${newName}"`);
      
      // Check if we're still on the same function (use address/id)
      const currentFunctionId = state.currentFunction?.address || state.currentFunction?.id;
      if (state.currentFunction && currentFunctionId === newState.functionId) {
        // 1. Apply the new variable name
        if (state.currentFunction.local_variables) {
          state.currentFunction.local_variables.forEach(variable => {
            if (variable.name === oldState.name) {
              variable.name = newState.name;
            }
          });
        }
        
        // 2. Restore pseudocode
        state.currentFunction.pseudocode = newState.pseudocode;
        
        // 3. Update Monaco editor
        if (window.updateMonacoEditorContent) {
          window.updateMonacoEditorContent(newState.pseudocode);
        } else {
          updateMonacoEditorContent(newState.pseudocode);
        }
        
        // 4. Update function name display
        const functionNameEl = document.getElementById('function-name');
        if (functionNameEl && state.currentFunction.name) {
          functionNameEl.textContent = state.currentFunction.name;
        }
        
        // 5. Update variables table
        const variablesTable = document.querySelector('#variables-table tbody');
        if (variablesTable && state.currentFunction.local_variables) {
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
            
            // IMPORTANT: Make the name cell editable by attaching click handler
            makeVariableEditable(nameCell, variable.name || 'unnamed');
          });
        }
      }
    }
  });
  
  return true;
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

// Function to make a variable name editable
export function makeVariableEditable(element, variableName) {
  // Get the actual variable name from the current state if possible
  // This ensures we're working with the correct name after undo operations
  let actualVariableName = variableName;
  if (state.currentFunction && state.currentFunction.local_variables) {
    const matchingVar = state.currentFunction.local_variables.find(v => v.name === variableName);
    if (!matchingVar && element.textContent) {
      // If we can't find the variable by the passed name, use the element's text content
      actualVariableName = element.textContent.trim();
    }
  }
  
  console.log(`Making variable name editable: UI name=${variableName}, Actual name=${actualVariableName}`);
  
  // Ensure we've cleaned up any stale inputs in document
  document.querySelectorAll('.function-rename-input, .variable-rename-input').forEach(el => {
    el.blur();
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // Set basic editable properties
  element.textContent = actualVariableName;
  element.classList.add('editable');
  element.title = 'Click to rename variable';
  element.setAttribute('data-variable-name', actualVariableName);
  
  // IMPORTANT: Clean up any existing handlers
  element.removeEventListener('click', element.renameClickHandler);
  
  // New click handler properly scoped
  element.renameClickHandler = function startEditMode(e) {
    // If an event is provided, prevent default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Stop if already editing
    if (document.querySelector('.function-rename-input, .variable-rename-input')) {
      return;
    }
    
    // Store original name
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
    
    // Ensure we only add the event listeners once
    let alreadyHandled = false;
    
    // Store reference to blur handler so we can remove it
    let blurHandler = null;
    
    const completeEdit = async (name) => {
      if (alreadyHandled) return;
      alreadyHandled = true;
      
      // CRITICAL: Remove blur listener BEFORE any validation to prevent race condition
      if (blurHandler) {
        input.removeEventListener('blur', blurHandler);
        console.log("Removed blur listener before validation");
      }
      
      if (name && name !== originalName) {
        // Attempt the rename
        try {
          console.log(`Calling renameVariable with: "${originalName}" -> "${name}"`);
          const success = await renameVariable(originalName, name);
          console.log(`renameVariable returned: ${success}`);
          
          if (success === false) {
            // Validation failed - keep input and refocus
            console.log("Validation failed, keeping input focused");
            
            // Reset input value to what user typed (so they can correct it)
            input.value = name;
            
            // Refocus after modal is dismissed and re-add blur listener
            setTimeout(() => {
              console.log("Re-focusing input after failed validation");
              input.focus();
              input.select();
              alreadyHandled = false; // Allow edit to continue
              
              // Re-add the blur listener
              blurHandler = function(e) {
                console.log("Blur handler called, activeElement:", document.activeElement);
                if (document.activeElement === document.body) {
                  console.log("Blur due to modal, ignoring");
                  return;
                }
                
                if (!alreadyHandled) {
                  console.log("Calling completeEdit from blur handler");
                  completeEdit(this.value.trim());
                }
              };
              input.addEventListener('blur', blurHandler);
              console.log("Re-added blur listener");
            }, 50); // Slightly longer delay
          } else {
            // Success - remove the input and restore the variable name
            console.log("Validation succeeded, removing input and restoring variable name");
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
            // Restore the variable name text with the new name
            element.textContent = name;
            element.setAttribute('data-variable-name', name);
          }
        } catch (error) {
          console.error("Error during rename:", error);
          
          window.showErrorModal("An error occurred while renaming. Please try again.");
          
          setTimeout(() => {
            input.focus();
            input.select();
            alreadyHandled = false;
            
            // Re-add the blur listener
            blurHandler = function(e) {
              if (document.activeElement === document.body) {
                console.log("Blur due to modal, ignoring");
                return;
              }
              
              if (!alreadyHandled) {
                completeEdit(this.value.trim());
              }
            };
            input.addEventListener('blur', blurHandler);
          }, 50);
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
    
    // Handle blur - only complete if not from modal
    blurHandler = function(e) {
      // Don't complete edit if blur is from modal
      if (document.activeElement === document.body) {
        console.log("Blur due to modal, ignoring");
        return;
      }
      
      if (!alreadyHandled) {
        completeEdit(this.value.trim());
      }
    };
    input.addEventListener('blur', blurHandler);
    
    // Handle keyboard events
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        completeEdit(this.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        alreadyHandled = true;
        
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