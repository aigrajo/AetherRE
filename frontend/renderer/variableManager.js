import { state } from './core.js';
import { recordAction } from './historyManager.js';

// Function to rename a variable
export function renameVariable(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return false;
  
  console.log(`Attempting to rename variable from "${oldName}" to "${newName}"`);
  
  // Validate the new name format - only allow alphanumeric and underscore
  const validNamePattern = /^[a-zA-Z0-9_]+$/;
  if (!validNamePattern.test(newName)) {
    console.error(`Cannot rename to "${newName}" - only alphanumeric characters and underscores are allowed`);
    window.showErrorModal(`Invalid name: "${newName}" - only letters, numbers, and underscores are allowed.`);
    return false;
  }
  
  // Don't allow names starting with a number
  if (/^[0-9]/.test(newName)) {
    console.error(`Cannot rename to "${newName}" - names cannot start with a number`);
    window.showErrorModal(`Invalid name: "${newName}" - names cannot start with a number.`);
    return false;
  }
  
  // Check if the new name exists anywhere in the pseudocode except in variable declarations
  if (state.currentFunction && state.currentFunction.pseudocode) {
    const pseudocode = state.currentFunction.pseudocode;
    
    // Modified check to avoid false positives on the variable we're renaming:
    // 1. Don't consider exact matches to the variable declaration pattern
    const declarationPattern = new RegExp(`(int|char|long|float|double|bool)\\s+${oldName}\\s*;`);
    const usagePattern = new RegExp(`\\b${oldName}\\b`);
    
    // Do a simple check for the existence of the new name in pseudocode
    if (pseudocode.indexOf(newName) >= 0) {
      // Now check if the matches are ONLY in the variable declaration or the variable we're renaming
      // If so, that's okay because we'll be replacing those
      
      const firstIndex = pseudocode.indexOf(newName);
      const declarationIndex = pseudocode.search(declarationPattern);
      const isPartOfCurrentVariable = usagePattern.test(pseudocode) && 
                                    (declarationIndex >= 0 ||
                                     pseudocode.indexOf(oldName) >= 0);
      
      // If we find the new name in a context other than replacing the old variable
      if (isPartOfCurrentVariable === false) {
        console.error(`Cannot rename to "${newName}" - this name exists as part of other identifiers in the pseudocode`);
        console.debug(`Found "${newName}" at position ${firstIndex}, declaration is at ${declarationIndex}`);
        window.showErrorModal(`Cannot rename to "${newName}" - this name exists as part of other identifiers in the pseudocode and would cause conflicts.`);
        return false;
      } else {
        console.log(`Found "${newName}" but only in our variable context, allowing rename`);
      }
    }
    
    // Expanded list of C language keywords - case insensitive check
    const cKeywords = [
      'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 
      'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 
      'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 
      'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 
      'volatile', 'while'
    ];
    
    if (cKeywords.some(keyword => keyword.toLowerCase() === newName.toLowerCase())) {
      console.error(`Cannot rename to "${newName}" - this is a reserved keyword`);
      window.showErrorModal(`Cannot rename to "${newName}" - this is a reserved C keyword and would cause conflicts.`);
      return false;
    }
    
    // Check variable conflicts
    if (state.currentFunction.local_variables) {
      const existingVar = state.currentFunction.local_variables.find(v => v.name === newName && v.name !== oldName);
      if (existingVar) {
        console.error(`Cannot rename to "${newName}" - a variable with this name already exists`);
        window.showErrorModal(`Cannot rename to "${newName}" - a variable with this name already exists in this function.`);
        return false;
      }
    }
  }
  
  // All validation passed, now actually perform the rename
  console.log(`Renaming variable from "${oldName}" to "${newName}"`);
  
  // Store old state for history
  const oldState = {
    name: oldName,
    functionId: state.currentFunction.id,
    functionName: state.currentFunction.name,
    pseudocode: state.currentFunction.pseudocode,
    localVariables: state.currentFunction.local_variables ? JSON.parse(JSON.stringify(state.currentFunction.local_variables)) : null
  };
  
  // Update in local_variables
  if (state.currentFunction.local_variables) {
    state.currentFunction.local_variables.forEach(variable => {
      if (variable.name === oldName) {
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
    functionId: state.currentFunction.id,
    functionName: state.currentFunction.name,
    pseudocode: state.currentFunction.pseudocode,
    localVariables: state.currentFunction.local_variables ? JSON.parse(JSON.stringify(state.currentFunction.local_variables)) : null
  };
  
  // Log whether pseudocode was updated
  console.log(`Pseudocode updated: ${updatedPseudocode}, old length: ${oldState.pseudocode.length}, new length: ${newState.pseudocode.length}`);
  
  // Record action for undo/redo
  recordAction({
    type: 'rename_variable',
    oldState,
    newState,
    undo: () => {
      console.log(`Undoing rename of variable from "${newName}" to "${oldState.name}"`);
      
      // Only perform undo if we're still on the same function
      if (state.currentFunction && state.currentFunction.id === oldState.functionId) {
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
        
        // 4. Update variables table
        const variablesTable = document.querySelector('#variables-table tbody');
        if (variablesTable && state.currentFunction.local_variables) {
          variablesTable.innerHTML = '';
          
          state.currentFunction.local_variables.forEach(variable => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = variable.name || 'unnamed';
            // Make it editable but without causing recursion
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
          });
          
          // Add click listeners to cells after table rebuild
          setTimeout(() => {
            const cells = variablesTable.querySelectorAll('.editable');
            cells.forEach(cell => {
              if (!cell.hasClickListener) {
                makeVariableEditable(cell, cell.textContent);
                cell.hasClickListener = true;
              }
            });
          }, 0);
        }
      }
    },
    redo: () => {
      console.log(`Redoing rename of variable from "${oldState.name}" to "${newName}"`);
      
      // Only perform redo if we're still on the same function
      if (state.currentFunction && state.currentFunction.id === newState.functionId) {
        // 1. Restore the new variable name
        if (state.currentFunction.local_variables) {
          state.currentFunction.local_variables.forEach(variable => {
            if (variable.name === oldState.name) {
              variable.name = newState.name;
            }
          });
        }
        
        // 2. Restore pseudocode - IMPORTANT: use the stored pseudocode rather than trying to do a replace
        state.currentFunction.pseudocode = newState.pseudocode;
        
        // 3. Update Monaco editor immediately with the new pseudocode
        if (window.updateMonacoEditorContent) {
          window.updateMonacoEditorContent(newState.pseudocode);
        } else {
          updateMonacoEditorContent(newState.pseudocode);
        }
        
        // 4. Update variables table
        const variablesTable = document.querySelector('#variables-table tbody');
        if (variablesTable && state.currentFunction.local_variables) {
          variablesTable.innerHTML = '';
          
          state.currentFunction.local_variables.forEach(variable => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = variable.name || 'unnamed';
            // Make it editable but without causing recursion
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
          });
          
          // Add click listeners to cells after table rebuild
          setTimeout(() => {
            const cells = variablesTable.querySelectorAll('.editable');
            cells.forEach(cell => {
              if (!cell.hasClickListener) {
                makeVariableEditable(cell, cell.textContent);
                cell.hasClickListener = true;
              }
            });
          }, 0);
        }
      }
    }
  });
  
  // Update variables table - THIS MUST BE INSIDE A SUCCESS FLOW
  const variablesTable = document.querySelector('#variables-table tbody');
  if (variablesTable && state.currentFunction.local_variables) {
    variablesTable.innerHTML = '';
    
    state.currentFunction.local_variables.forEach(variable => {
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
  }
  
  return { success: true }; // Explicitly return success object
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
    
    const completeEdit = (name) => {
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
          const success = renameVariable(originalName, name);
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
            // Success - remove the input
            console.log("Validation succeeded, removing input");
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
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