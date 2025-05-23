import { state } from './core.js';
import { recordAction } from './historyManager.js';

// Global flag to track focus issues
let focusIssueDetected = false;

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

// Function to rename a function
export function renameFunction(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return false;
  
  console.log(`Attempting to rename function from "${oldName}" to "${newName}"`);
  
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
  
  // Check if the new name exists anywhere in the pseudocode EXCEPT in the declaration
  if (state.currentFunction && state.currentFunction.pseudocode) {
    const pseudocode = state.currentFunction.pseudocode;
    
    // Modified check to avoid false positives on the function we're renaming:
    // 1. Don't consider exact matches to the function declaration pattern
    const declarationPattern = new RegExp(`(void|int|char|long|float|double)\\s+${oldName}\\s*\\(`);
    
    // Do a simple check for the existence of the new name in pseudocode
    if (pseudocode.indexOf(newName) >= 0) {
      // Now check if the matches are ONLY in the function declaration
      // If so, that's okay because we'll be replacing those
      const hasFunctionDeclaration = declarationPattern.test(pseudocode);
      
      // Only count as conflict if the name exists outside the function declaration
      const firstIndex = pseudocode.indexOf(newName);
      const declarationIndex = pseudocode.search(declarationPattern);
      const endsWithinDeclaration = declarationIndex >= 0 && 
                                   firstIndex >= declarationIndex && 
                                   firstIndex < declarationIndex + oldName.length + 20; // Rough estimate of declaration length
      
      if (!endsWithinDeclaration) {
        console.error(`Cannot rename to "${newName}" - this name exists as part of other identifiers in the pseudocode`);
        console.debug(`Found "${newName}" at position ${firstIndex}, declaration is at ${declarationIndex}`);
        window.showErrorModal(`Cannot rename to "${newName}" - this name exists as part of other identifiers in the pseudocode and would cause conflicts.`);
        return false;
      } else {
        console.log(`Found "${newName}" but only in function declaration, allowing rename`);
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
    
    // Check for function name conflicts
    if (state.functionsData && state.functionsData.functions) {
      const existingFunc = state.functionsData.functions.find(f => 
        f.name === newName && f.id !== state.currentFunction.id
      );
      if (existingFunc) {
        console.error(`Cannot rename to "${newName}" - a function with this name already exists`);
        window.showErrorModal(`Cannot rename to "${newName}" - a function with this name already exists in this program.`);
        return false;
      }
    }
  }
  
  // All validation passed, now actually perform the rename
  console.log(`Renaming function from "${oldName}" to "${newName}"`);
  
  // Store old state for history
  const oldState = {
    name: oldName,
    functionId: state.currentFunction.id,
    pseudocode: state.currentFunction.pseudocode,
    functionsData: state.functionsData ? JSON.parse(JSON.stringify(state.functionsData)) : null
  };
  
  // Update the function name in current function
  state.currentFunction.name = newName;
  
  // Update in functions list if available
  if (state.functionsData && state.functionsData.functions) {
    const func = state.functionsData.functions.find(f => f.name === oldName);
    if (func) {
      func.name = newName;
    }
  }
  
  // Update in pseudocode - CRITICAL PATH
  let updatedPseudocode = false;
  if (state.currentFunction.pseudocode) {
    try {
      // Create a regex that matches the function name as a whole word
      const regex = new RegExp(`\\b${oldName}\\b`, 'g');
      const newPseudocode = state.currentFunction.pseudocode.replace(regex, newName);
      
      // Only update if changes were actually made
      if (newPseudocode !== state.currentFunction.pseudocode) {
        state.currentFunction.pseudocode = newPseudocode;
        updatedPseudocode = true;
        console.log(`Updated pseudocode with new function name "${newName}"`);
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
    pseudocode: state.currentFunction.pseudocode,
    functionsData: state.functionsData ? JSON.parse(JSON.stringify(state.functionsData)) : null
  };
  
  // Log whether pseudocode was updated
  console.log(`Pseudocode updated: ${updatedPseudocode}, old length: ${oldState.pseudocode.length}, new length: ${newState.pseudocode.length}`);
  
  // Record action for undo/redo
  recordAction({
    type: 'rename_function',
    oldState,
    newState,
    undo: () => {
      console.log(`Undoing rename of function from "${newName}" to "${oldState.name}"`);
      
      // Only perform undo if we're still on the same function
      if (state.currentFunction && state.currentFunction.id === oldState.functionId) {
        // 1. Restore the old function name
        state.currentFunction.name = oldState.name;
        
        // 2. Restore functions data if available
        if (oldState.functionsData && state.functionsData) {
          // Find and update the function in the functions list
          const func = state.functionsData.functions.find(f => f.name === newState.name);
          if (func) {
            func.name = oldState.name;
          }
        }
        
        // 3. Restore pseudocode - IMPORTANT: use the stored pseudocode rather than trying to do a replace
        state.currentFunction.pseudocode = oldState.pseudocode;
        
        // 4. Update Monaco editor immediately with the old pseudocode
        if (window.updateMonacoEditorContent) {
          window.updateMonacoEditorContent(oldState.pseudocode);
        } else {
          updateMonacoEditorContent(oldState.pseudocode);
        }
        
        // 5. Update function name in UI
        const functionNameEl = document.getElementById('function-name');
        if (functionNameEl) {
          functionNameEl.textContent = oldState.name;
          // Important: need to update the editable state but without recursion
          functionNameEl.setAttribute('data-function-name', oldState.name);
        }
        
        // 6. Update function list
        if (window.renderFunctionList && state.functionsData && state.functionsData.functions) {
          window.renderFunctionList(state.functionsData.functions);
        }
      }
    },
    redo: () => {
      console.log(`Redoing rename of function from "${oldState.name}" to "${newName}"`);
      
      // Only perform redo if we're still on the same function
      if (state.currentFunction && state.currentFunction.id === newState.functionId) {
        // 1. Restore the new function name
        state.currentFunction.name = newState.name;
        
        // 2. Restore functions data if available
        if (newState.functionsData && state.functionsData) {
          // Find and update the function in the functions list
          const func = state.functionsData.functions.find(f => f.name === oldState.name);
          if (func) {
            func.name = newState.name;
          }
        }
        
        // 3. Restore pseudocode - IMPORTANT: use the stored pseudocode rather than trying to do a replace
        state.currentFunction.pseudocode = newState.pseudocode;
        
        // 4. Update Monaco editor immediately with the new pseudocode
        if (window.updateMonacoEditorContent) {
          window.updateMonacoEditorContent(newState.pseudocode);
        } else {
          updateMonacoEditorContent(newState.pseudocode);
        }
        
        // 5. Update function name in UI
        const functionNameEl = document.getElementById('function-name');
        if (functionNameEl) {
          functionNameEl.textContent = newState.name;
          // Important: need to update the editable state but without recursion
          functionNameEl.setAttribute('data-function-name', newState.name);
        }
        
        // 6. Update function list
        if (window.renderFunctionList && state.functionsData && state.functionsData.functions) {
          window.renderFunctionList(state.functionsData.functions);
        }
      }
    }
  });
  
  // Update UI - THIS MUST BE INSIDE A SUCCESS FLOW
  const functionNameEl = document.getElementById('function-name');
  if (functionNameEl) {
    functionNameEl.textContent = newName;
    // When we successfully rename, update the editable state with the new name
    makeFunctionNameEditable(functionNameEl, newName);
  }
  
  // Update function list
  if (window.renderFunctionList && state.functionsData && state.functionsData.functions) {
    window.renderFunctionList(state.functionsData.functions);
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

// Function to make a function name editable
export function makeFunctionNameEditable(element, functionName) {
  // Always use the current function name from state if available
  // This ensures we're working with the correct name after undo operations
  const currentName = state.currentFunction ? state.currentFunction.name : functionName;
  
  console.log(`Making function name editable: UI name=${functionName}, Current state name=${currentName}`);
  
  // First, ensure we've cleaned up any stale inputs in document
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
    
    // Use a shared flag stored on the element to prevent conflicts
    element._editInProgress = false;
    
    const completeEdit = (name) => {
      if (element._editInProgress) return;
      element._editInProgress = true;
      
      if (name && name !== originalName) {
        // Attempt the rename
        try {
          console.log(`Calling renameFunction with: "${originalName}" -> "${name}"`);
          const success = renameFunction(originalName, name);
          console.log(`renameFunction returned: ${success}`);
          
          if (success === false) {
            // Validation failed - need to recreate the input completely
            console.log("Validation failed, recreating input element");
            
            // Remove the blur handler to prevent interference
            input.removeEventListener('blur', blurHandler);
            
            // Remove the current input entirely
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
            
            // Reset the element to show the original name
            element.textContent = originalName;
            
            // Clear the flag before recreating
            element._editInProgress = false;
            
            // Recreate the entire input after modal is dismissed
            setTimeout(() => {
              console.log("Recreating input after validation failure");
              // Recreate the input by calling the click handler again
              element.click();
            }, 100);
            
            return; // Exit early to prevent further processing
          } else {
            // Success - remove the input
            console.log("Validation succeeded, removing input");
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
            element._editInProgress = false;
          }
        } catch (error) {
          console.error("Error during rename:", error);
          
          window.showErrorModal("An error occurred while renaming. Please try again.");
          
          // Remove the blur handler to prevent interference
          input.removeEventListener('blur', blurHandler);
          
          // Recreate input completely on error too
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
          element.textContent = originalName;
          element._editInProgress = false;
          
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
        element._editInProgress = false;
      }
    };
    
    // Select all after a short delay
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
    
    // Handle blur
    const blurHandler = function(e) {
      // Don't complete edit if blur is from modal
      if (document.activeElement === document.body) {
        console.log("Blur due to modal, ignoring");
        return;
      }
      
      if (!element._editInProgress) {
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
        element._editInProgress = true;
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