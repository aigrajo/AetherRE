// TagNotePanel.js - Main component for the note and tags panel

// Import necessary components
import { initNoteEditor } from './NoteEditor.js';
import { initTagsPanel } from './TagsPanel.js';

// Track the current state
let currentBinary = null;
let currentFunctionId = null;
let activeTabId = 'notes'; // Default tab

// Backend file service API base URL
const FILE_API_BASE = 'http://localhost:8000/api/files';

/**
 * Initialize the TagNote panel
 */
export function initTagNotePanel() {
  // Create the panel HTML structure
  createPanelDOM();
  
  // Setup resizer for the panel
  setupResizer();
  
  // Initialize tabs
  setupTabs();
  
  // Initialize the note editor
  initNoteEditor();
  
  // Initialize the tags panel
  initTagsPanel();
  
  // Listen for function selection changes
  window.addEventListener('function-selected', handleFunctionChange);
  
  // Listen for binary changes
  window.addEventListener('binary-loaded', handleBinaryChange);
}

/**
 * Create the panel DOM structure and append it to the DOM
 */
function createPanelDOM() {
  const contentArea = document.querySelector('.content-area');
  if (!contentArea) return;
  
  const tagNotePanel = document.createElement('div');
  tagNotePanel.className = 'tagnote-panel';
  
  tagNotePanel.innerHTML = `
    <div class="tagnote-resizer"></div>
    <div class="tagnote-header">
      <div class="tagnote-tabs">
        <button class="tagnote-tab active" data-tab="notes">Notes</button>
        <button class="tagnote-tab" data-tab="tags">Tags</button>
      </div>
      <div class="tagnote-actions">
        <!-- Optional actions like export/import can go here -->
      </div>
    </div>
    <div class="tagnote-content">
      <div class="tagnote-content-inner">
        <div id="notes-tab" class="tagnote-tab-pane active">
          <div id="note-editor" class="note-editor"></div>
          <div id="note-status" class="note-status">Last saved: Never</div>
        </div>
        <div id="tags-tab" class="tagnote-tab-pane">
          <div id="tags-panel" class="tags-panel"></div>
        </div>
      </div>
    </div>
  `;
  
  contentArea.appendChild(tagNotePanel);
}

/**
 * Set up the resizer for the panel
 */
function setupResizer() {
  const resizer = document.querySelector('.tagnote-resizer');
  const panel = document.querySelector('.tagnote-panel');
  
  if (!resizer || !panel) return;
  
  let startY, startHeight;
  
  function startResize(e) {
    startY = e.clientY;
    startHeight = parseInt(document.defaultView.getComputedStyle(panel).height, 10);
    document.documentElement.classList.add('resizing');
    resizer.classList.add('resizing');
    
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  }
  
  function resize(e) {
    const newHeight = startHeight - (e.clientY - startY);
    if (newHeight > 120 && newHeight < window.innerHeight * 0.7) {
      panel.style.height = `${newHeight}px`;
    }
  }
  
  function stopResize() {
    document.documentElement.classList.remove('resizing');
    resizer.classList.remove('resizing');
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  }
  
  resizer.addEventListener('mousedown', startResize);
}

/**
 * Set up the tabs for switching between Notes and Tags
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.tagnote-tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      
      // Update active tab
      document.querySelectorAll('.tagnote-tab').forEach(t => {
        t.classList.toggle('active', t === tab);
      });
      
      // Update active tab content
      document.querySelectorAll('.tagnote-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabId}-tab`);
      });
      
      // Update current state
      activeTabId = tabId;
    });
  });
}

/**
 * Handle function selection changes
 * @param {CustomEvent} event - The function-selected event containing the function data
 */
async function handleFunctionChange(event) {
  const { functionId, functionName } = event.detail;
  console.log(`TagNotePanel: Function changed to ${functionName} (${functionId})`);
  
  if (!functionId) {
    console.error('TagNotePanel: Function selection event missing function ID');
    return;
  }
  
  // Normalize function ID
  const normalizedFunctionId = functionId.replace(/^0x/, '').toLowerCase();
  
  if (normalizedFunctionId === currentFunctionId) {
    console.log('TagNotePanel: Same function, ignoring change');
    return;
  }
  
  console.log(`TagNotePanel: Updating current function ID from ${currentFunctionId} to ${normalizedFunctionId}`);
  currentFunctionId = normalizedFunctionId;
  
  // Dispatch events to load notes and tags
  await dispatchLoadData();
}

/**
 * Handle binary changes
 * @param {CustomEvent} event - The binary-loaded event containing the binary data
 */
function handleBinaryChange(event) {
  const { binaryName } = event.detail;
  console.log(`TagNotePanel: Binary changed to ${binaryName}`);
  
  if (!binaryName) {
    console.error('TagNotePanel: Binary loaded event missing binary name');
    return;
  }
  
  // Clean binary name (just store it as is)
  if (binaryName === currentBinary) {
    console.log('TagNotePanel: Same binary, ignoring change');
    return;
  }
  
  console.log(`TagNotePanel: Updating current binary from ${currentBinary} to ${binaryName}`);
  currentBinary = binaryName;
  
  // Reset function ID when binary changes
  currentFunctionId = null;
  
  // Clear notes and tags
  document.dispatchEvent(new CustomEvent('clear-note'));
  document.dispatchEvent(new CustomEvent('clear-tags'));
}

/**
 * Dispatch events to load data based on current binary and function
 */
async function dispatchLoadData() {
  if (!currentBinary || !currentFunctionId) {
    console.error('TagNotePanel: Cannot load data - missing binary or function ID', {
      currentBinary,
      currentFunctionId
    });
    return;
  }
  
  // Use backend service to clean binary name to ensure consistency with getCurrentContext
  let cleanBinaryName = null;
  try {
    const response = await fetch(`${FILE_API_BASE}/sanitize-binary-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ binary_name: currentBinary })
    });
    
    if (response.ok) {
      const result = await response.json();
      cleanBinaryName = result.sanitized_name;
    } else {
      console.warn('Failed to sanitize binary name, using fallback');
      cleanBinaryName = currentBinary.replace(/[^\w\d]/g, '_');
    }
  } catch (error) {
    console.warn('Error sanitizing binary name:', error);
    cleanBinaryName = currentBinary.replace(/[^\w\d]/g, '_');
  }

  console.log(`TagNotePanel: Dispatching load events for ${cleanBinaryName}/${currentFunctionId}`);
  
  // Dispatch load note event
  console.log(`TagNotePanel: Dispatching load-note event for ${cleanBinaryName}/${currentFunctionId}`);
  document.dispatchEvent(new CustomEvent('load-note', {
    detail: {
      binaryName: cleanBinaryName,
      functionId: currentFunctionId
    }
  }));
  
  // Dispatch load tags event
  console.log(`TagNotePanel: Dispatching load-tags event for ${cleanBinaryName}/${currentFunctionId}`);
  document.dispatchEvent(new CustomEvent('load-tags', {
    detail: {
      binaryName: cleanBinaryName,
      functionId: currentFunctionId
    }
  }));
  
  console.log(`TagNotePanel: Finished dispatching load events for ${cleanBinaryName}/${currentFunctionId}`);
}

/**
 * Get the current binary name and function ID
 * @returns {Object} The current binary and function ID
 */
export async function getCurrentContext() {
  // Use backend service to clean binary name to ensure proper filesystem compatibility
  let cleanBinaryName = null;
  if (currentBinary) {
    try {
      const response = await fetch(`${FILE_API_BASE}/sanitize-binary-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binary_name: currentBinary })
      });
      
      if (response.ok) {
        const result = await response.json();
        cleanBinaryName = result.sanitized_name;
      } else {
        console.warn('Failed to sanitize binary name, using fallback');
        cleanBinaryName = currentBinary;
      }
    } catch (error) {
      console.warn('Error sanitizing binary name:', error);
      cleanBinaryName = currentBinary;
    }
  }
  
  const context = {
    binaryName: cleanBinaryName,
    functionId: currentFunctionId
  };
  
  console.log('getCurrentContext() returning:', context);
  console.log('- currentBinary:', currentBinary);
  console.log('- currentFunctionId:', currentFunctionId);
  
  return context;
} 