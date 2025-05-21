import { state } from './core.js';

// Function to rename a variable
export function renameVariable(oldName, newName) {
  if (!state.currentFunction || !oldName || !newName || oldName === newName) return;
  
  // Update in local_variables
  if (state.currentFunction.local_variables) {
    state.currentFunction.local_variables.forEach(variable => {
      if (variable.name === oldName) {
        variable.name = newName;
      }
    });
  }
  
  // Update in pseudocode
  if (state.currentFunction.pseudocode) {
    // Create a regex that matches the variable name as a whole word
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    state.currentFunction.pseudocode = state.currentFunction.pseudocode.replace(regex, newName);
  }
  
  // Update the display by re-displaying the current function
  import('./functionManager.js').then(module => {
    module.displayFunctionInfo(state.currentFunction);
  });
}

// Function to make a variable name editable
export function makeVariableEditable(element, variableName) {
  element.classList.add('editable');
  element.title = 'Click to rename variable';
  
  element.addEventListener('click', (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = variableName;
    input.className = 'variable-rename-input';
    
    // Replace the text with input
    element.textContent = '';
    element.appendChild(input);
    input.focus();
    
    // Select all text
    input.setSelectionRange(0, input.value.length);
    
    const finishEditing = () => {
      const newName = input.value.trim();
      if (newName && newName !== variableName) {
        renameVariable(variableName, newName);
      }
      element.textContent = newName || variableName;
    };
    
    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEditing();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        element.textContent = variableName;
      }
    });
  });
} 