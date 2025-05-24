// Project Manager - Handles saving and loading AetherRE project files
import { state } from './core.js';
import { apiService } from './apiService.js';

// Project file format version
const PROJECT_VERSION = "1.0";

/**
 * Calculate SHA256 hash of the current binary
 */
async function calculateBinaryHash() {
  if (!state.currentFilePath) {
    throw new Error("No binary loaded");
  }
  
  try {
    const response = await apiService.calculateBinaryHash(state.currentFilePath);
    return response.hash;
  } catch (error) {
    console.error('Error calculating binary hash:', error);
    throw new Error("Failed to calculate binary hash");
  }
}

/**
 * Collect project data without saving - fully backend-driven
 */
export async function collectProjectData(projectName = null) {
  // Validate we have a binary loaded
  if (!state.originalBinaryName || !state.currentFilePath) {
    throw new Error("No binary loaded. Please load a binary file first.");
  }

  console.log("=== Starting Project Data Collection ===");
  console.log(`Binary: ${state.originalBinaryName}`);
  console.log(`File path: ${state.currentFilePath}`);

  // Use the backend service for all collection logic
  const response = await apiService.collectProjectData(
    projectName,
    state.originalBinaryName,
    state.currentFilePath,
    state.functionsData || {}
  );
  
  console.log("Project data collected via backend service");
  console.log("=== Project Data Collection Summary ===");
  const customizations = response.project_data.customizations;
  console.log(`Function names: ${Object.keys(customizations.function_names || {}).length}`);
  console.log(`Variable names: ${Object.keys(customizations.variable_names || {}).length}`);
  console.log(`Notes: ${Object.keys(customizations.notes || {}).length}`);
  console.log(`Tags: ${Object.keys(customizations.tags || {}).length}`);
  console.log(`Chat sessions: ${(response.project_data.chat_history?.sessions || []).length}`);
  console.log("=== End Collection Summary ===");
  
  return response.project_data;
}

/**
 * Load project from file - simplified frontend logic
 */
export async function loadProject(projectFile) {
  try {
    console.log(`Loading project: ${projectFile}`);
    
    // Check if projectFile is provided
    if (!projectFile) {
      console.log('No project file selected');
      return false;
    }
    
    // Validate we have a binary loaded first
    if (!state.originalBinaryName || !state.currentFilePath) {
      throw new Error("Please load the target binary first, then load the project file.");
    }
    
    // Load project data from file
    console.log('Loading project data from file...');
    const projectData = await window.electronAPI.loadProject(projectFile);
    
    // Check if user cancelled the dialog
    if (!projectData) {
      console.log('Project loading cancelled by user');
      return false;
    }
    
    console.log('Project data loaded:', {
      name: projectData.aetherre_project?.name,
      functionNames: Object.keys(projectData.customizations?.function_names || {}).length,
      variableNames: Object.keys(projectData.customizations?.variable_names || {}).length,
      notes: Object.keys(projectData.customizations?.notes || {}).length,
      tags: Object.keys(projectData.customizations?.tags || {}).length,
      chatSessions: projectData.chat_history?.sessions?.length || 0
    });
    
    // Apply project data using the new backend service
    const result = await applyProjectData(projectData);
    
    if (result) {
      showSuccessMessage(`Project "${projectData.aetherre_project.name}" loaded successfully!`);
      console.log(`Project "${projectData.aetherre_project.name}" loading completed successfully`);
    }
    
    return result;
    
  } catch (error) {
    console.error('Error loading project:', error);
    showErrorMessage(`Failed to load project: ${error.message}`);
    return false;
  }
}

/**
 * Apply project data using the new backend service
 */
export async function applyProjectData(projectData) {
  try {
    console.log(`Applying project: ${projectData.aetherre_project.name}`);
    
    // Validate we have a binary loaded first
    if (!state.originalBinaryName || !state.currentFilePath) {
      throw new Error("Please load the target binary first, then load the project file.");
    }
    
    console.log("Applying project data via backend service...");
    
    // Use the new backend service for complete project application
    const response = await apiService.applyCompleteProject(
      state.functionsData || {},
      projectData,
      state.currentFilePath,
      state.originalBinaryName
    );
    
    if (!response.success) {
      throw new Error("Backend failed to apply project data");
    }
    
    // Update the frontend state with the modified functions data
    state.functionsData = response.functions_data;
    
    console.log("Project application results:", response.results);
    
    // Refresh UI to show applied changes
    await refreshUIAfterProjectApplication(response.results);
    
    console.log(`Project "${projectData.aetherre_project.name}" applied successfully!`);
    return true;
    
  } catch (error) {
    console.error('Error applying project data:', error);
    throw error;
  }
}

/**
 * Refresh UI after project application
 */
async function refreshUIAfterProjectApplication(results) {
  console.log('Refreshing UI after project application...');
  
  // Refresh function list to show updated names
  if (window.renderFunctionList && state.functionsData?.functions) {
    console.log('Updating function list with new names...');
    window.renderFunctionList(state.functionsData.functions);
  }
  
  // Update current function display if Monaco editor is showing a function
  if (state.currentFunction && window.updateMonacoEditorContent) {
    // Find the updated function data
    const updatedFunction = state.functionsData.functions.find(
      f => f.address === state.currentFunction.address
    );
    
    if (updatedFunction) {
      // Update the current function state
      state.currentFunction = updatedFunction;
      
      // Update Monaco editor with potentially modified pseudocode
      console.log('Updating Monaco editor with modified pseudocode...');
      window.updateMonacoEditorContent(updatedFunction.pseudocode);
      
      // Update function name display
      const functionNameEl = document.getElementById('function-name');
      if (functionNameEl) {
        functionNameEl.textContent = updatedFunction.name;
        functionNameEl.setAttribute('data-function-name', updatedFunction.name);
      }
    }
  }
  
  // Reset and refresh the TagNotes panel
  console.log('Refreshing TagNotes panel...');
  
  // Dispatch binary-loaded event to reset the panel state
  window.dispatchEvent(new CustomEvent('binary-loaded', {
    detail: { binaryName: state.originalBinaryName }
  }));
  
  // Find a function to display (prefer current function or one with data)
  let targetFunctionId = null;
  let targetFunctionName = null;
  
  if (state.currentFunction) {
    targetFunctionId = state.currentFunction.address;
    targetFunctionName = state.currentFunction.name;
  } else if (results.notes_applied > 0 || results.tags_applied > 0) {
    // Auto-select a function that has loaded data
    const functionsWithData = state.functionsData.functions.find(
      f => f.address && (f.name !== `FUN_${f.address}` && f.name !== `SUB_${f.address}`)
    );
    
    if (functionsWithData) {
      targetFunctionId = functionsWithData.address;
      targetFunctionName = functionsWithData.name;
    }
  }
  
  // Trigger function selection to show notes/tags
  if (targetFunctionId) {
    setTimeout(() => {
      console.log(`Refreshing TagNotes for function ${targetFunctionName} (${targetFunctionId})`);
      window.dispatchEvent(new CustomEvent('function-selected', {
        detail: {
          functionId: targetFunctionId,
          functionName: targetFunctionName
        }
      }));
    }, 500);
  }
  
  // Refresh chat sessions if any were restored
  if (results.chat_sessions_restored > 0) {
    console.log('Refreshing chat sessions...');
    try {
      const { refreshChatSessions } = await import('./chat.js');
      await refreshChatSessions();
      console.log('Chat sessions refreshed');
    } catch (error) {
      console.warn('Could not refresh chat sessions:', error);
    }
  }
  
  console.log('UI refresh completed');
}

/**
 * Show success message to user
 */
function showSuccessMessage(message) {
  const notification = document.createElement('div');
  notification.className = 'project-notification success';
  notification.style.cssText = `
    position: fixed; 
    top: 20px; 
    right: 20px; 
    background: #4CAF50; 
    color: white; 
    padding: 12px 24px; 
    border-radius: 4px; 
    z-index: 10000; 
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * Show error message to user
 */
function showErrorMessage(message) {
  if (window.showErrorModal) {
    window.showErrorModal(message);
  } else {
    alert(message);
  }
}

/**
 * Get project info for display
 */
export function getProjectInfo() {
  if (!state.originalBinaryName) {
    return null;
  }
  
  return {
    binaryName: state.originalBinaryName,
    functionsAnalyzed: state.functionsData?.functions?.length || 0,
    hasCustomizations: hasAnyCustomizations()
  };
}

/**
 * Check if there are any customizations worth saving
 */
function hasAnyCustomizations() {
  // Check for custom function names
  if (state.functionsData?.functions) {
    const hasCustomFunctions = state.functionsData.functions.some(func => 
      func.name && !func.name.startsWith('FUN_') && !func.name.startsWith('SUB_')
    );
    if (hasCustomFunctions) return true;
  }
  
  // Assume there might be customizations (notes, tags, etc.)
  return true;
} 