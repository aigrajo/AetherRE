// History management for undo/redo operations
import { state } from './core.js';

// History stack for undo/redo operations
const history = {
  undoStack: [],
  redoStack: [],
  maxHistorySize: 50  // Maximum number of actions to keep in history
};

// Debug mode
const DEBUG = true;

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[HistoryManager]', ...args);
  }
}

/**
 * Check if an action is a duplicate of the last recorded action
 * @param {Object} action - The action to check
 * @returns {boolean} - Whether the action is a duplicate
 */
function isDuplicateAction(action) {
  if (history.undoStack.length === 0) return false;
  
  const lastAction = history.undoStack[history.undoStack.length - 1];
  
  // Check for duplicate rename actions
  if (action.type === 'rename_function' && lastAction.type === 'rename_function') {
    return action.oldState.name === lastAction.oldState.name && 
           action.newState.name === lastAction.newState.name &&
           action.oldState.functionId === lastAction.oldState.functionId;
  }
  
  if (action.type === 'rename_variable' && lastAction.type === 'rename_variable') {
    return action.oldState.name === lastAction.oldState.name && 
           action.newState.name === lastAction.newState.name &&
           action.oldState.functionId === lastAction.oldState.functionId;
  }
  
  return false;
}

/**
 * Record an action for potential undo/redo
 * @param {Object} action - The action to record with undo/redo functions
 */
export function recordAction(action) {
  // Check if this is a duplicate action
  if (isDuplicateAction(action)) {
    debugLog(`Skipping duplicate action: ${action.type}`, action);
    return;
  }
  
  debugLog(`Recording action: ${action.type}`, action);
  
  // Clear redo stack when a new action is performed
  history.redoStack = [];
  
  // Add to undo stack
  history.undoStack.push(action);
  
  // Trim history if it exceeds the maximum size
  if (history.undoStack.length > history.maxHistorySize) {
    history.undoStack.shift();
  }
  
  debugLog(`History stack now has ${history.undoStack.length} items`);
  
  // Enable undo button if it exists
  updateUndoRedoButtons();
}

/**
 * Undo the last action
 */
export function undo() {
  if (history.undoStack.length === 0) {
    debugLog("Cannot undo - history stack is empty");
    return;
  }
  
  const action = history.undoStack.pop();
  debugLog(`Undoing action: ${action.type}`, action);
  
  history.redoStack.push(action);
  
  // For rename actions, extract the old pseudocode for direct update
  let pseudocode = null;
  if (action.type === 'rename_function' || action.type === 'rename_variable') {
    if (action.oldState && action.oldState.pseudocode) {
      pseudocode = action.oldState.pseudocode;
    }
  }
  
  // Call the undo function from the action
  if (action && typeof action.undo === 'function') {
    try {
      action.undo();
      
      // Extra step to ensure pseudocode is displayed correctly
      if (pseudocode && window.updateMonacoEditorContent) {
        debugLog("Directly updating editor with saved pseudocode");
        window.updateMonacoEditorContent(pseudocode);
      }
      
      debugLog("Undo operation completed successfully");
    } catch (error) {
      console.error("Error during undo operation:", error);
    }
  } else {
    debugLog("Warning: Action has no undo function", action);
  }
  
  updateUndoRedoButtons();
}

/**
 * Redo the last undone action
 */
export function redo() {
  if (history.redoStack.length === 0) {
    debugLog("Cannot redo - redo stack is empty");
    return;
  }
  
  const action = history.redoStack.pop();
  debugLog(`Redoing action: ${action.type}`, action);
  
  history.undoStack.push(action);
  
  // For rename actions, extract the new pseudocode for direct update
  let pseudocode = null;
  if (action.type === 'rename_function' || action.type === 'rename_variable') {
    if (action.newState && action.newState.pseudocode) {
      pseudocode = action.newState.pseudocode;
    }
  }
  
  // Call the redo function from the action
  if (action && typeof action.redo === 'function') {
    try {
      action.redo();
      
      // Extra step to ensure pseudocode is displayed correctly
      if (pseudocode && window.updateMonacoEditorContent) {
        debugLog("Directly updating editor with saved pseudocode");
        window.updateMonacoEditorContent(pseudocode);
      }
      
      debugLog("Redo operation completed successfully");
    } catch (error) {
      console.error("Error during redo operation:", error);
    }
  } else {
    debugLog("Warning: Action has no redo function", action);
  }
  
  updateUndoRedoButtons();
}

/**
 * Clear history stacks
 */
export function clearHistory() {
  debugLog("Clearing history stacks");
  history.undoStack = [];
  history.redoStack = [];
  updateUndoRedoButtons();
}

/**
 * Update the state of undo/redo buttons
 */
function updateUndoRedoButtons() {
  const undoButton = document.getElementById('undo-button');
  const redoButton = document.getElementById('redo-button');
  
  if (undoButton) {
    undoButton.disabled = history.undoStack.length === 0;
  }
  
  if (redoButton) {
    redoButton.disabled = history.redoStack.length === 0;
  }
}

/**
 * Initialize undo/redo keyboard shortcuts
 */
export function initHistoryKeyboardShortcuts() {
  debugLog("Initializing history keyboard shortcuts");
  
  document.addEventListener('keydown', (e) => {
    // Ctrl+Z or Command+Z for Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      debugLog("Ctrl+Z detected - triggering undo");
      e.preventDefault();
      undo();
    }
    
    // Ctrl+Y or Command+Shift+Z for Redo
    if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
      debugLog("Ctrl+Y or Ctrl+Shift+Z detected - triggering redo");
      e.preventDefault();
      redo();
    }
  });
}

/**
 * Initialize history manager
 */
export function initHistoryManager() {
  debugLog("Initializing history manager");
  initHistoryKeyboardShortcuts();
  
  // Add event listeners to any existing undo/redo buttons
  const undoButton = document.getElementById('undo-button');
  const redoButton = document.getElementById('redo-button');
  
  if (undoButton) {
    undoButton.addEventListener('click', undo);
    undoButton.disabled = true;
    debugLog("Attached undo event listener to button");
  }
  
  if (redoButton) {
    redoButton.addEventListener('click', redo);
    redoButton.disabled = true;
    debugLog("Attached redo event listener to button");
  }
  
  debugLog("History manager initialization complete");
} 