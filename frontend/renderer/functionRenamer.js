import { state } from './core.js';

// Function to rename a function
export function renameFunction(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return;
  
  // Update the function name in current function
  state.currentFunction.name = newName;
  
  // Update in functions list if available
  if (state.functionsData && state.functionsData.functions) {
    const func = state.functionsData.functions.find(f => f.name === oldName);
    if (func) {
      func.name = newName;
    }
  }
  
  // Update in pseudocode
  if (state.currentFunction.pseudocode) {
    // Create a regex that matches the function name as a whole word
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    state.currentFunction.pseudocode = state.currentFunction.pseudocode.replace(regex, newName);
  }
  
  // Update the display by re-displaying the current function
  import('./functionManager.js').then(module => {
    module.displayFunctionInfo(state.currentFunction);
    
    // Also re-render the function list to show the new name
    if (state.functionsData && state.functionsData.functions) {
      module.renderFunctionList(state.functionsData.functions);
    }
  });
}

// Function to make a function name editable
export function makeFunctionNameEditable(element, functionName) {
  element.classList.add('editable');
  element.title = 'Click to rename function';
  
  element.addEventListener('click', (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = functionName;
    input.className = 'function-rename-input';
    
    // Replace the text with input
    const originalContent = element.textContent;
    element.textContent = '';
    element.appendChild(input);
    input.focus();
    
    // Select all text
    input.setSelectionRange(0, input.value.length);
    
    const finishEditing = () => {
      const newName = input.value.trim();
      if (newName && newName !== functionName) {
        renameFunction(functionName, newName);
      } else {
        element.textContent = originalContent;
      }
    };
    
    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEditing();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        element.textContent = originalContent;
      }
    });
  });
} 