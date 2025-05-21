import { state } from './core.js';
import { getFunctionName, findFunction } from './core.js';
import { handleXRefRowClick } from './xrefs.js';
import { makeVariableEditable } from './variableManager.js';
import { showNodeDetails } from './cfgVisualizer.js';

// Tab switching function
export function switchTab(tabName) {
  console.log('Switching to tab:', tabName);
  
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  
  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}-tab`);
  });
  
  // Refresh editor layout when switching to pseudocode or assembly tab
  if ((tabName === 'pseudocode' || tabName === 'assembly') && state.monacoEditor) {
    setTimeout(() => {
      if (tabName === 'pseudocode') {
        state.monacoEditor.layout();
      } else if (tabName === 'assembly' && state.assemblyEditor) {
        state.assemblyEditor.layout();
      }
    }, 0);
  }
  
  // If switching to xrefs tab, force update
  if (tabName === 'xrefs' && window.currentFunction) {
    console.log('Force updating xrefs tab for:', window.currentFunction);
    updateXRefsTab(window.currentFunction);
  }
}

// Setup tab switching
export function setupTabSwitching() {
  // Add click handlers to all tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });
  });
  
  // Set initial active tab
  const defaultTab = 'pseudocode';
  switchTab(defaultTab);
}

// Function to update the Assembly tab with the function's assembly data
export function updateAssemblyTab(func) {
  if (!func || !func.assembly) {
    const assemblyTableBody = document.querySelector('#assembly-table tbody');
    assemblyTableBody.innerHTML = '<tr><td colspan="5">No assembly available</td></tr>';
    return;
  }

  // Get the assembly table body
  const assemblyTableBody = document.querySelector('#assembly-table tbody');
  assemblyTableBody.innerHTML = '';
  
  // Add assembly instructions to the table
  func.assembly.forEach(instr => {
    const row = document.createElement('tr');
    const address = String(instr.address);
    const offset = instr.offset.toString(16).padStart(8, '0');
    const bytes = String(instr.bytes);
    const mnemonic = String(instr.mnemonic);
    const operands = instr.operands || '';
    row.innerHTML = `
      <td class="asm-address">${address}</td>
      <td class="asm-offset">${offset}</td>
      <td class="asm-bytes">${bytes}</td>
      <td class="asm-mnemonic">${mnemonic}</td>
      <td class="asm-operands">${operands}</td>
    `;
    assemblyTableBody.appendChild(row);
  });
}

// Function to update the Variables tab with the function's local variables
export function updateVariablesTab(func) {
  if (!func || !func.local_variables) {
    const variablesTable = document.querySelector('#variables-table tbody');
    variablesTable.innerHTML = '<tr><td colspan="4">No local variables found</td></tr>';
    return;
  }

  // Get the variables table body
  const variablesTable = document.querySelector('#variables-table tbody');
  variablesTable.innerHTML = '';
  
  // Add variables to the table
  if (func.local_variables && func.local_variables.length > 0) {
    func.local_variables.forEach(variable => {
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
  } else {
    variablesTable.innerHTML = '<tr><td colspan="4">No local variables found</td></tr>';
  }
}

// Function to update the Strings tab with the function's string references
export function updateStringsTab(func) {
  if (!func || !func.local_strings) {
    const stringsTable = document.querySelector('#strings-table tbody');
    stringsTable.innerHTML = '<tr><td colspan="3">No local strings found</td></tr>';
    return;
  }

  // Get the strings table body
  const stringsTable = document.querySelector('#strings-table tbody');
  stringsTable.innerHTML = '';
  
  // Add strings to the table
  if (func.local_strings && func.local_strings.length > 0) {
    func.local_strings.forEach(str => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${str.address || 'N/A'}</td>
        <td>${str.value || 'N/A'}</td>
        <td>${str.type || 'string'}</td>
      `;
      stringsTable.appendChild(row);
    });
  } else {
    stringsTable.innerHTML = '<tr><td colspan="3">No local strings found</td></tr>';
  }
}

// Helper function to group references by function
export function groupReferencesByFunction(refs) {
  const grouped = new Map();
  
  refs.forEach(ref => {
    const funcAddr = ref.source_func || ref.target_func;
    if (!grouped.has(funcAddr)) {
      grouped.set(funcAddr, []);
    }
    grouped.get(funcAddr).push(ref);
  });
  
  return grouped;
}

// Function to update the XRefs tab
export function updateXRefsTab(functionObj) {
  // Forward to the xrefs module's updateXRefsTab function
  import('./xrefs.js').then(module => {
    module.updateXRefsTab(functionObj);
  });
}

// Function to update the CFG tab
export function updateCFGTab(func) {
  // Forward to the cfgVisualizer module's updateCFGTab function
  import('./cfgVisualizer.js').then(module => {
    module.updateCFGTab(func);
  });
} 