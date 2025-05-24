import { state } from './core.js';
import { getFunctionName, findFunction } from './core.js';
import { displayFunctionInfo } from './functionManager.js';
import { groupReferencesByFunction } from './tabManager.js';

// Helper function to handle xref row clicks
export function handleXRefRowClick(row, targetFunc, event) {
  // If the click was on a link, prevent default behavior
  if (event && event.target.classList.contains('xref-link')) {
    event.preventDefault();
  }
  
  // Add visual feedback
  const allRows = document.querySelectorAll('#incoming-xrefs-table tr, #outgoing-xrefs-table tr');
  allRows.forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  
  // Find and navigate to the function
  const func = findFunction(targetFunc);
  if (func) {
    // Update function list selection
    const functionItems = document.querySelectorAll('.function-item');
    functionItems.forEach(item => item.classList.remove('selected'));
    const functionItem = document.querySelector(`.function-item[data-address="${func.address}"]`);
    if (functionItem) {
      functionItem.classList.add('selected');
      functionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Update function display
    displayFunctionInfo(func);
  } else {
    console.warn('Could not find function:', targetFunc);
  }
}

// Fetch cross-references from backend
async function fetchXRefs(functionObj) {
  const direction = document.getElementById('xref-direction-filter').value;
  const sortBy = document.getElementById('xref-sort-by').value;
  const response = await fetch('http://localhost:8000/api/xrefs/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function_address: functionObj.address,
      direction: direction,
      sort_by: sortBy
    })
  });
  if (!response.ok) {
    throw new Error('Failed to fetch cross-references');
  }
  return await response.json();
}

// Cross References Tab Functions
export async function updateXRefsTab(functionObj) {
  console.log('updateXRefsTab called with:', functionObj);

  if (!functionObj) {
    console.error('No function object provided to updateXRefsTab');
    return;
  }

  // Get the tables and sections
  const incomingTable = document.getElementById('incoming-xrefs-table').getElementsByTagName('tbody')[0];
  const outgoingTable = document.getElementById('outgoing-xrefs-table').getElementsByTagName('tbody')[0];
  const incomingSection = document.querySelector('.xref-section:nth-child(1)');
  const outgoingSection = document.querySelector('.xref-section:nth-child(2)');

  // Clear existing rows
  incomingTable.innerHTML = '';
  outgoingTable.innerHTML = '';

  // Fetch xrefs from backend
  let xrefs;
  try {
    xrefs = await fetchXRefs(functionObj);
  } catch (err) {
    console.error('Error fetching xrefs:', err);
    incomingTable.innerHTML = '<tr><td colspan="5">No cross-reference data available</td></tr>';
    outgoingTable.innerHTML = '<tr><td colspan="5">No cross-reference data available</td></tr>';
    return;
  }

  // Apply filters
  const directionFilter = document.getElementById('xref-direction-filter').value;

  // Show/hide sections based on direction filter
  incomingSection.style.display = (directionFilter === 'all' || directionFilter === 'incoming') ? 'block' : 'none';
  outgoingSection.style.display = (directionFilter === 'all' || directionFilter === 'outgoing') ? 'block' : 'none';

  // Populate incoming table if visible
  if (incomingSection.style.display !== 'none') {
    const incomingRefs = xrefs.incoming || [];
    if (incomingRefs.length === 0) {
      incomingTable.innerHTML = '<tr><td colspan="5">No incoming references found</td></tr>';
    } else {
      let lastAddr = null;
      incomingRefs.forEach(ref => {
        try {
          const row = incomingTable.insertRow();
          const name = getFunctionName(ref.source_func) || 'Unknown';
          const addr = ref.source_func;

          // Add a visual separator between different functions
          if (lastAddr && lastAddr !== addr) {
            row.classList.add('function-separator');
          }
          lastAddr = addr;

          row.innerHTML = `
            <td class="xref-name"><a href="#" class="xref-link">${name}</a></td>
            <td class="xref-address">${addr || 'Unknown'}</td>
            <td class="xref-offset">${(ref.offset || 0).toString(16)}</td>
            <td class="xref-context">${ref.context || ''}</td>
          `;

          // Add click handlers
          const link = row.querySelector('.xref-link');
          link.addEventListener('click', (e) => handleXRefRowClick(row, ref.source_func, e));
          row.addEventListener('click', (e) => handleXRefRowClick(row, ref.source_func, e));
        } catch (err) {
          console.error('Error creating incoming reference row:', err);
        }
      });
    }
  }

  // Populate outgoing table if visible
  if (outgoingSection.style.display !== 'none') {
    const outgoingRefs = xrefs.outgoing || [];
    if (outgoingRefs.length === 0) {
      outgoingTable.innerHTML = '<tr><td colspan="5">No outgoing references found</td></tr>';
    } else {
      let lastAddr = null;
      outgoingRefs.forEach(ref => {
        try {
          const row = outgoingTable.insertRow();
          const name = getFunctionName(ref.target_func) || 'Unknown';
          const addr = ref.target_func;

          // Add a visual separator between different functions
          if (lastAddr && lastAddr !== addr) {
            row.classList.add('function-separator');
          }
          lastAddr = addr;

          row.innerHTML = `
            <td class="xref-name"><a href="#" class="xref-link">${name}</a></td>
            <td class="xref-address">${addr || 'Unknown'}</td>
            <td class="xref-offset">${(ref.offset || 0).toString(16)}</td>
            <td class="xref-context">${ref.context || ''}</td>
          `;

          // Add click handlers
          const link = row.querySelector('.xref-link');
          link.addEventListener('click', (e) => handleXRefRowClick(row, ref.target_func, e));
          row.addEventListener('click', (e) => handleXRefRowClick(row, ref.target_func, e));
        } catch (err) {
          console.error('Error creating outgoing reference row:', err);
        }
      });
    }
  }
}

// Setup XRef direction and sorting filters
export function setupXRefFilters() {
  document.getElementById('xref-direction-filter')?.addEventListener('change', () => {
    if (window.currentFunction) {
      updateXRefsTab(window.currentFunction);
    }
  });
  
  document.getElementById('xref-sort-by')?.addEventListener('change', () => {
    if (window.currentFunction) {
      updateXRefsTab(window.currentFunction);
    }
  });
} 