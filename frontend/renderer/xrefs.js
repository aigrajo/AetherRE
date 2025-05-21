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

// Cross References Tab Functions
export function updateXRefsTab(functionObj) {
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
  
  // Try to find the cross_references data in various places
  let xrefs = null;
  let dataSources = [
    window.currentData?.cross_references,
    state.functionsData?.cross_references,
    window?.cross_references
  ];
  
  for (const source of dataSources) {
    if (source && source.incoming && source.outgoing) {
      xrefs = source;
      console.log('Found xrefs data source:', source);
      break;
    }
  }
  
  if (!xrefs) {
    console.error('No cross_references data found in any data source');
    incomingTable.innerHTML = '<tr><td colspan="5">No cross-reference data available</td></tr>';
    outgoingTable.innerHTML = '<tr><td colspan="5">No cross-reference data available</td></tr>';
    return;
  }
  
  // Get function address in various formats to try matching
  const addressFormats = [];
  if (functionObj.address) {
    addressFormats.push(functionObj.address);
    if (functionObj.address.startsWith('0x')) {
      addressFormats.push(functionObj.address.substring(2));
    } else {
      addressFormats.push('0x' + functionObj.address);
    }
    addressFormats.push(functionObj.address.toLowerCase());
    addressFormats.push(functionObj.address.toUpperCase());
  }
  
  // Find matching refs using any of the address formats
  let incomingRefs = [];
  let outgoingRefs = [];
  
  for (const addr of addressFormats) {
    if (xrefs.incoming[addr] && xrefs.incoming[addr].length > 0) {
      incomingRefs = xrefs.incoming[addr];
      break;
    }
  }
  
  for (const addr of addressFormats) {
    if (xrefs.outgoing[addr] && xrefs.outgoing[addr].length > 0) {
      outgoingRefs = xrefs.outgoing[addr];
      break;
    }
  }
  
  // Apply filters
  const directionFilter = document.getElementById('xref-direction-filter').value;
  const sortBy = document.getElementById('xref-sort-by').value;
  
  // Show/hide sections based on direction filter
  incomingSection.style.display = (directionFilter === 'all' || directionFilter === 'incoming') ? 'block' : 'none';
  outgoingSection.style.display = (directionFilter === 'all' || directionFilter === 'outgoing') ? 'block' : 'none';
  
  // Sort references
  const sortReferences = (refs, isOutgoing = false) => {
    try {
      return [...refs].sort((a, b) => {
        const aAddr = isOutgoing ? a.target_func : a.source_func;
        const bAddr = isOutgoing ? b.target_func : b.source_func;
        
        // Group references by function for count-based sorting
        const grouped = new Map();
        refs.forEach(ref => {
          const funcAddr = isOutgoing ? ref.target_func : ref.source_func;
          if (!grouped.has(funcAddr)) {
            grouped.set(funcAddr, []);
          }
          grouped.get(funcAddr).push(ref);
        });
        
        switch (sortBy) {
          case 'name':
            return (getFunctionName(aAddr) || '').localeCompare(getFunctionName(bAddr) || '');
          case 'address':
            // First sort by address
            const addrCompare = aAddr.localeCompare(bAddr);
            if (addrCompare !== 0) return addrCompare;
            // Then by offset if addresses are the same
            return (a.offset || 0) - (b.offset || 0);
          case 'count':
            // Compare by number of references to each function
            const aCount = grouped.get(aAddr)?.length || 0;
            const bCount = grouped.get(bAddr)?.length || 0;
            if (bCount !== aCount) return bCount - aCount;
            // If counts are equal, sort by offset
            return (a.offset || 0) - (b.offset || 0);
          default:
            return 0;
        }
      });
    } catch (err) {
      console.error('Error sorting references:', err);
      return refs;
    }
  };

  // Sort references
  const sortedIncoming = sortReferences(incomingRefs, false);
  const sortedOutgoing = sortReferences(outgoingRefs, true);
  
  // Populate incoming table if visible
  if (incomingSection.style.display !== 'none') {
    if (sortedIncoming.length === 0) {
      incomingTable.innerHTML = '<tr><td colspan="5">No incoming references found</td></tr>';
    } else {
      let lastAddr = null;
      sortedIncoming.forEach(ref => {
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
    if (sortedOutgoing.length === 0) {
      outgoingTable.innerHTML = '<tr><td colspan="5">No outgoing references found</td></tr>';
    } else {
      let lastAddr = null;
      sortedOutgoing.forEach(ref => {
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