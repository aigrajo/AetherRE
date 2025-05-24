// History management for undo/redo operations
// Now backed by the backend history service
import { state } from './core.js';
import { apiService } from './apiService.js';

// Debug mode
const DEBUG = true;

// Current session state
let currentSessionId = null;
let buttonUpdateInProgress = false;

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[HistoryManager]', ...args);
  }
}

/**
 * Get or create a session ID
 */
function getSessionId() {
  if (!currentSessionId) {
    // Use the global session ID if available, otherwise create a new one
    currentSessionId = state.currentSessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (!state.currentSessionId) {
      state.currentSessionId = currentSessionId;
    }
  }
  return currentSessionId;
}

/**
 * Record an operation for potential undo/redo
 * @param {Object} actionData - The action data with type, old/new states, and metadata
 */
export async function recordAction(actionData) {
  try {
    const sessionId = getSessionId();
    
    debugLog(`Recording action: ${actionData.type}`, actionData);
    
    // Prepare operation data for the backend
    const operationData = {
      type: actionData.type,
      // Include any operation-specific data
      ...(actionData.operationData || {})
    };
    
    const oldState = actionData.oldState || {};
    const newState = actionData.newState || {};
    const metadata = actionData.metadata || {};
    
    // Record the operation in the backend
    const result = await apiService.recordOperation(
      sessionId,
      actionData.type,
      operationData,
      oldState,
      newState,
      metadata
    );
    
    if (result.success) {
      debugLog(`Successfully recorded operation with ID: ${result.operation_id}`);
      await updateUndoRedoButtons();
    } else {
      console.error('Failed to record operation:', result.error);
    }
    
  } catch (error) {
    console.error('Error recording action:', error);
  }
}

/**
 * Undo the last action
 */
export async function undo() {
  try {
    const sessionId = getSessionId();
    debugLog("Attempting to undo last operation");
    
    const result = await apiService.undoLastOperation(sessionId);
    
    if (result.success) {
      debugLog(`Undoing operation: ${result.operation.type}`, result.operation);
      
      // Apply the restored state based on operation type
      await applyRestoredState(result.operation, result.restored_state);
      
      // Update button states
      await updateUndoRedoButtons();
      
      debugLog("Undo operation completed successfully");
    } else {
      debugLog("Cannot undo:", result.error);
    }
    
  } catch (error) {
    console.error("Error during undo operation:", error);
  }
}

/**
 * Redo the last undone action
 */
export async function redo() {
  try {
    const sessionId = getSessionId();
    debugLog("Attempting to redo last operation");
    
    const result = await apiService.redoLastOperation(sessionId);
    
    if (result.success) {
      debugLog(`Redoing operation: ${result.operation.type}`, result.operation);
      
      // Apply the restored state based on operation type
      await applyRestoredState(result.operation, result.restored_state);
      
      // Update button states
      await updateUndoRedoButtons();
      
      debugLog("Redo operation completed successfully");
    } else {
      debugLog("Cannot redo:", result.error);
    }
    
  } catch (error) {
    console.error("Error during redo operation:", error);
  }
}

/**
 * Update Monaco editor content directly
 */
function updateMonacoEditorContent(content) {
  debugLog(`Updating Monaco editor with content (${content ? content.length : 0} chars)`);
  
  if (state.monacoEditor && content) {
    try {
      const model = state.monacoEditor.getModel();
      if (model) {
        model.setValue(content);
        debugLog("Successfully updated Monaco editor via model.setValue");
      } else {
        state.monacoEditor.setValue(content);
        debugLog("Successfully updated Monaco editor via editor.setValue");
      }
      
      // Force layout update
      state.monacoEditor.layout();
      debugLog("Monaco editor layout updated");
    } catch (error) {
      console.error("Error updating Monaco editor:", error);
    }
  } else {
    debugLog("Cannot update Monaco editor:", {
      hasEditor: !!state.monacoEditor,
      hasContent: !!content,
      contentLength: content ? content.length : 0
    });
  }
}

/**
 * Apply restored state based on operation type
 */
async function applyRestoredState(operation, restoredState) {
  const operationType = operation.type;
  
  debugLog(`Applying restored state for operation type: ${operationType}`, restoredState);
  
  switch (operationType) {
    case 'rename_function':
      // Use the specialized function renamer restore logic
      try {
        debugLog("Using functionRenamer's applyRestoredState for function rename");
        const { applyRestoredState: applyFunctionRestoredState } = await import('./functionRenamer.js');
        await applyFunctionRestoredState(restoredState);
      } catch (error) {
        console.error('Error calling functionRenamer.applyRestoredState:', error);
        // Fallback to basic restoration
        await applyBasicFunctionRestore(restoredState);
      }
      break;
      
    case 'rename_variable':
      // Keep the existing variable rename logic
      await applyBasicFunctionRestore(restoredState);
      
      // Update variables table if it's a variable operation
      if (window.updateVariablesTable) {
        debugLog("Triggering updateVariablesTable");
        window.updateVariablesTable();
      }
      break;
      
    default:
      debugLog(`No specific restore handler for operation type: ${operationType}`);
      // For custom operation types, look for custom restore handlers
      if (window.customHistoryHandlers && window.customHistoryHandlers[operationType]) {
        await window.customHistoryHandlers[operationType](operation, restoredState);
      }
      break;
  }
  
  // Force a general UI refresh
  setTimeout(() => {
    // Trigger any global UI update functions
    if (window.refreshUI) {
      debugLog("Triggering global UI refresh");
      window.refreshUI();
    }
    
    // Force Monaco editor layout update
    if (state.monacoEditor && state.monacoEditor.layout) {
      state.monacoEditor.layout();
    }
    
    if (state.assemblyEditor && state.assemblyEditor.layout) {
      state.assemblyEditor.layout();
    }
  }, 10);
}

/**
 * Basic function restore for fallback scenarios
 */
async function applyBasicFunctionRestore(restoredState) {
  debugLog("Applying basic function restore");
  
  // Update current function if present
  if (restoredState.currentFunction) {
    debugLog("Updating current function");
    state.currentFunction = restoredState.currentFunction;
  }
  
  // Update functions data if present
  if (restoredState.functionsData) {
    debugLog("Updating functions data");
    state.functionsData = restoredState.functionsData;
  }
  
  // Update Monaco editor with pseudocode - check multiple possible locations
  let pseudocodeToRestore = null;
  
  // First try the direct pseudocode field
  if (restoredState.pseudocode) {
    pseudocodeToRestore = restoredState.pseudocode;
    debugLog("Found pseudocode in restoredState.pseudocode");
  }
  // Then try the current function's pseudocode
  else if (state.currentFunction && state.currentFunction.pseudocode) {
    pseudocodeToRestore = state.currentFunction.pseudocode;
    debugLog("Found pseudocode in state.currentFunction.pseudocode");
  }
  // Finally try the restored current function's pseudocode
  else if (restoredState.currentFunction && restoredState.currentFunction.pseudocode) {
    pseudocodeToRestore = restoredState.currentFunction.pseudocode;
    debugLog("Found pseudocode in restoredState.currentFunction.pseudocode");
  }
  
  if (pseudocodeToRestore) {
    debugLog("Updating Monaco editor with restored pseudocode:", pseudocodeToRestore.substring(0, 100) + "...");
    updateMonacoEditorContent(pseudocodeToRestore);
  } else {
    debugLog("No pseudocode found to restore");
  }
  
  // Update function name display
  if (state.currentFunction && state.currentFunction.name) {
    debugLog("Updating function name display");
    const functionNameEl = document.getElementById('function-name');
    if (functionNameEl) {
      functionNameEl.textContent = state.currentFunction.name;
      functionNameEl.setAttribute('data-function-name', state.currentFunction.name);
      debugLog(`Updated function name display to: ${state.currentFunction.name}`);
    }
  }
  
  // Trigger UI updates if available
  if (window.updateFunctionsList) {
    debugLog("Triggering updateFunctionsList");
    window.updateFunctionsList();
  }
}

/**
 * Clear history for the current session
 */
export async function clearHistory() {
  try {
    const sessionId = getSessionId();
    debugLog("Clearing history for session:", sessionId);
    
    const result = await apiService.clearHistory(sessionId);
    
    if (result.success) {
      await updateUndoRedoButtons();
      debugLog("History cleared successfully");
    } else {
      console.error("Failed to clear history:", result.message);
    }
    
  } catch (error) {
    console.error("Error clearing history:", error);
  }
}

/**
 * Update the state of undo/redo buttons
 */
async function updateUndoRedoButtons() {
  if (buttonUpdateInProgress) return;
  buttonUpdateInProgress = true;
  
  try {
    const sessionId = getSessionId();
    const historyState = await apiService.getHistoryState(sessionId);
    
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');
    
    if (undoButton) {
      undoButton.disabled = !historyState.can_undo;
    }
    
    if (redoButton) {
      redoButton.disabled = !historyState.can_redo;
    }
    
    debugLog(`Updated button states - Can undo: ${historyState.can_undo}, Can redo: ${historyState.can_redo}`);
    
  } catch (error) {
    console.error("Error updating undo/redo buttons:", error);
    
    // Fallback: disable buttons on error
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');
    
    if (undoButton) undoButton.disabled = true;
    if (redoButton) redoButton.disabled = true;
    
  } finally {
    buttonUpdateInProgress = false;
  }
}

/**
 * Check if the current focus is on a text input element that should use browser native undo
 */
function shouldUseBrowserUndo() {
  const activeElement = document.activeElement;
  
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  const inputType = activeElement.type ? activeElement.type.toLowerCase() : '';
  
  // Text input elements that should use browser native undo
  const textInputTags = ['textarea', 'input'];
  const textInputTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
  
  // Check if it's a text input element
  if (textInputTags.includes(tagName)) {
    // For input elements, check if it's a text-type input
    if (tagName === 'input') {
      return textInputTypes.includes(inputType) || inputType === '';
    }
    // For textarea, always use browser undo
    return true;
  }
  
  // Check for contenteditable elements
  if (activeElement.contentEditable === 'true') {
    return true;
  }
  
  // Check if we're in a Monaco editor (let Monaco handle its own undo)
  if (activeElement.classList.contains('monaco-editor') || 
      activeElement.closest('.monaco-editor')) {
    return true;
  }
  
  return false;
}

/**
 * Initialize history keyboard shortcuts
 */
export function initHistoryKeyboardShortcuts() {
  debugLog("Initializing history keyboard shortcuts");
  
  document.addEventListener('keydown', (e) => {
    // Check if we should let the browser/editor handle undo/redo
    if (shouldUseBrowserUndo()) {
      debugLog("Letting browser/editor handle undo/redo for focused text input");
      return; // Don't prevent default, let browser handle it
    }
    
    // Ctrl+Z or Command+Z for Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      debugLog("Ctrl+Z detected - triggering custom undo");
      e.preventDefault();
      undo();
    }
    
    // Ctrl+Y or Command+Shift+Z for Redo
    if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
      debugLog("Ctrl+Y or Ctrl+Shift+Z detected - triggering custom redo");
      e.preventDefault();
      redo();
    }
  });
}

/**
 * Initialize history manager
 */
export async function initHistoryManager() {
  debugLog("Initializing history manager");
  
  // Initialize keyboard shortcuts
  initHistoryKeyboardShortcuts();
  
  // Add event listeners to any existing undo/redo buttons
  const undoButton = document.getElementById('undo-button');
  const redoButton = document.getElementById('redo-button');
  
  if (undoButton) {
    undoButton.addEventListener('click', undo);
    debugLog("Attached undo event listener to button");
  }
  
  if (redoButton) {
    redoButton.addEventListener('click', redo);
    debugLog("Attached redo event listener to button");
  }
  
  // Initial button state update
  await updateUndoRedoButtons();
  
  debugLog("History manager initialization complete");
}

/**
 * Get current history state for debugging/monitoring
 */
export async function getHistoryInfo() {
  try {
    const sessionId = getSessionId();
    return await apiService.getHistoryState(sessionId);
  } catch (error) {
    console.error("Error getting history info:", error);
    return null;
  }
}

// Expose functions for debugging
if (DEBUG) {
  window.debugHistory = {
    getHistoryInfo,
    clearHistory,
    getSessionId: () => getSessionId(),
    testUndo: undo,
    testRedo: redo,
    testRecord: async (operationType = 'test_operation') => {
      await recordAction({
        type: operationType,
        operationData: { test: true },
        oldState: { value: 'old' },
        newState: { value: 'new' },
        metadata: { test: true }
      });
    },
    inspectState: () => {
      console.log('Current application state:');
      console.log('  currentFunction:', state.currentFunction);
      console.log('  functionsData:', state.functionsData);
      console.log('  monacoEditor:', state.monacoEditor);
      console.log('  currentSessionId:', state.currentSessionId);
      return {
        currentFunction: state.currentFunction,
        functionsData: state.functionsData,
        sessionId: getSessionId()
      };
    }
  };
  
  // Also expose direct access to the history for testing
  window.testHistory = async () => {
    console.log('Testing history system...');
    
    // Test recording an operation
    console.log('1. Recording test operation...');
    await recordAction({
      type: 'test_operation',
      operationData: { action: 'test' },
      oldState: { value: 'before' },
      newState: { value: 'after' },
      metadata: { timestamp: new Date().toISOString() }
    });
    
    // Test getting history state
    console.log('2. Getting history state...');
    const historyInfo = await getHistoryInfo();
    console.log('History state:', historyInfo);
    
    // Test undo
    console.log('3. Testing undo...');
    await undo();
    
    // Test redo
    console.log('4. Testing redo...');
    await redo();
    
    console.log('History test completed!');
  };
} 