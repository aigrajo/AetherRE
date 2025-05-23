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
    // Use the backend API to calculate hash
    const response = await apiService.calculateBinaryHash(state.currentFilePath);
    return response.hash;
  } catch (error) {
    console.error('Error calculating binary hash:', error);
    throw new Error("Failed to calculate binary hash");
  }
}

/**
 * Get the current binary name without extension
 */
function getCurrentBinaryName() {
  if (!state.originalBinaryName) {
    throw new Error("No binary name available");
  }
  
  // Remove file extension for clean binary name
  return state.originalBinaryName.replace(/\.[^/.]+$/, "");
}

/**
 * Clean binary name for filesystem compatibility
 */
async function cleanBinaryName(name) {
  const response = await apiService.cleanBinaryName(name);
  return response.cleaned_name;
}

/**
 * Collect custom function names from current state
 */
async function collectCustomFunctionNames() {
  console.log('Collecting custom function names...');
  console.log('state.functionsData:', !!state.functionsData);
  console.log('state.functionsData?.functions length:', state.functionsData?.functions?.length || 0);
  
  // Use backend service for collection
  const response = await apiService.collectCustomFunctionNames(state.functionsData || {});
  
  const customNames = response.function_names;
  console.log(`Collected ${Object.keys(customNames).length} custom function names:`, customNames);
  return customNames;
}

/**
 * Collect custom variable names from all functions
 */
async function collectCustomVariableNames() {
  console.log('Collecting custom variable names...');
  console.log('state.functionsData:', !!state.functionsData);
  console.log('state.functionsData?.functions length:', state.functionsData?.functions?.length || 0);
  
  // Use backend service for collection
  const response = await apiService.collectCustomVariableNames(state.functionsData || {});
  
  const variableNames = response.variable_names;
  console.log(`Collected variable names for ${Object.keys(variableNames).length} functions:`, variableNames);
  return variableNames;
}

/**
 * Collect all notes from frontend state instead of backend files
 */
async function collectAllNotes() {
  const notes = {};
  
  // Try to get the current note from the editor if available
  try {
    const { getCurrentContext } = await import('./TagNotePanel.js');
    const { getNoteContent } = await import('./NoteEditor.js');
    
    const currentContext = getCurrentContext();
    if (currentContext && currentContext.binaryName && currentContext.functionId) {
      const currentNoteContent = getNoteContent();
      if (currentNoteContent && currentNoteContent.trim()) {
        notes[currentContext.functionId] = currentNoteContent;
      }
    }
  } catch (error) {
    console.warn('Could not get current note from editor:', error);
  }
  
  // For other functions, we still need to query the backend since we don't have
  // a centralized frontend state for all notes
  const binaryName = await cleanBinaryName(getCurrentBinaryName());
  
  if (state.functionsData?.functions) {
    for (const func of state.functionsData.functions) {
      // Skip if we already got this note from the editor
      if (notes[func.address]) continue;
      
      try {
        const response = await fetch(`http://localhost:8000/api/notes/${binaryName}/${func.address}`);
        if (response.ok) {
          const data = await response.json();
          if (data.content && data.content.trim()) {
            notes[func.address] = data.content;
          }
        }
      } catch (error) {
        console.warn(`Failed to get note for function ${func.address}:`, error);
      }
    }
  }
  
  console.log(`Collected ${Object.keys(notes).length} function notes`);
  return notes;
}

/**
 * Collect all tags from frontend state instead of backend files
 */
async function collectAllTags() {
  const tags = {};
  
  // Try to get the current tags from the TagsPanel if available
  try {
    const { getCurrentContext } = await import('./TagNotePanel.js');
    const { getCurrentTags } = await import('./TagsPanel.js');
    
    const currentContext = getCurrentContext();
    if (currentContext && currentContext.binaryName && currentContext.functionId) {
      const currentTags = getCurrentTags();
      console.log(`Current function ${currentContext.functionId} has ${currentTags?.length || 0} tags from frontend`);
      if (currentTags && currentTags.length > 0) {
        tags[currentContext.functionId] = currentTags;
        console.log(`Collected ${currentTags.length} tags from frontend for function ${currentContext.functionId}`);
      }
    }
  } catch (error) {
    console.warn('Could not get current tags from TagsPanel:', error);
  }
  
  // For other functions, query the backend
  const binaryName = await cleanBinaryName(getCurrentBinaryName());
  
  if (state.functionsData?.functions) {
    for (const func of state.functionsData.functions) {
      // Skip if we already got tags for this function from the frontend
      if (tags[func.address]) continue;
      
      try {
        const response = await fetch(`http://localhost:8000/api/tags/${binaryName}/${func.address}`);
        if (response.ok) {
          const data = await response.json();
          if (data.tags && data.tags.length > 0) {
            tags[func.address] = data.tags;
          }
        }
      } catch (error) {
        console.warn(`Failed to get tags for function ${func.address}:`, error);
      }
    }
  }
  
  console.log(`Collected tags for ${Object.keys(tags).length} functions`);
  return tags;
}

/**
 * Collect chat sessions from backend
 */
async function collectChatSessions() {
  try {
    const response = await window.electronAPI.listChatSessions();
    const sessions = response.sessions.map(session => ({
      session_id: session.session_id,
      name: session.name,
      created_at: session.created_at,
      last_activity: session.last_activity,
      messages: session.messages
    }));
    
    console.log(`Collected ${sessions.length} chat sessions`);
    return sessions;
  } catch (error) {
    console.warn('Failed to collect chat sessions:', error);
    return [];
  }
}

/**
 * Collect project data without saving - enhanced with backend integration
 */
export async function collectProjectData(projectName = null) {
  // Validate we have a binary loaded
  if (!state.originalBinaryName || !state.currentFilePath) {
    throw new Error("No binary loaded. Please load a binary file first.");
  }

  console.log("=== Starting Project Data Collection ===");
  console.log(`Binary: ${state.originalBinaryName}`);
  console.log(`File path: ${state.currentFilePath}`);

  // Use the enhanced backend service
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
 * Load project from file
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
    
    // Load project data
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
    
    // Verify binary hash matches
    console.log('Verifying binary hash...');
    const currentHash = await calculateBinaryHash();
    if (projectData.target_binary.sha256 !== currentHash) {
      throw new Error(
        `Project file mismatch!\n\n` +
        `Project expects: ${projectData.target_binary.filename}\n` +
        `You have loaded: ${state.originalBinaryName}\n\n` +
        `Please load the correct binary file first.`
      );
    }
    console.log('Binary hash verification passed');
    
    // Apply customizations
    console.log("Applying project customizations...");
    await applyProjectCustomizations(projectData);
    
    showSuccessMessage(`Project "${projectData.aetherre_project.name}" loaded successfully!`);
    console.log(`Project "${projectData.aetherre_project.name}" loading completed successfully`);
    return true;
    
  } catch (error) {
    console.error('Error loading project:', error);
    showErrorMessage(`Failed to load project: ${error.message}`);
    return false;
  }
}

/**
 * Apply project customizations to current state
 */
async function applyProjectCustomizations(projectData) {
  const { customizations, chat_history } = projectData;
  
  console.log('Starting to apply project customizations...');
  
  // Apply function name customizations
  if (customizations.function_names) {
    console.log(`Applying ${Object.keys(customizations.function_names).length} custom function names...`);
    await applyCustomFunctionNames(customizations.function_names);
  }
  
  // Apply variable name customizations  
  if (customizations.variable_names) {
    console.log(`Applying variable names for ${Object.keys(customizations.variable_names).length} functions...`);
    await applyCustomVariableNames(customizations.variable_names);
  }
  
  // Apply notes
  if (customizations.notes) {
    console.log(`Applying ${Object.keys(customizations.notes).length} function notes...`);
    await applyNotes(customizations.notes);
  }
  
  // Apply tags
  if (customizations.tags) {
    console.log(`Applying tags for ${Object.keys(customizations.tags).length} functions...`);
    await applyTags(customizations.tags);
  }
  
  // Restore chat sessions
  if (chat_history.sessions) {
    console.log(`Restoring ${chat_history.sessions.length} chat sessions...`);
    console.log('Sessions to restore:', chat_history.sessions);
    await restoreChatSessions(chat_history.sessions);
  }
  
  // Refresh UI to show applied changes
  console.log('Refreshing function list UI...');
  if (window.renderFunctionList && state.functionsData?.functions) {
    window.renderFunctionList(state.functionsData.functions);
  }
  
  // Refresh TagNotes panel to show loaded notes/tags
  console.log('Refreshing TagNotes panel...');
  // First, dispatch a binary-loaded event to reset the panel state
  window.dispatchEvent(new CustomEvent('binary-loaded', {
    detail: {
      binaryName: state.originalBinaryName
    }
  }));
  
  // Then, if there's a currently selected function, refresh its notes/tags
  try {
    const { getCurrentContext } = await import('./TagNotePanel.js');
    const currentContext = getCurrentContext();
    
    let targetFunctionId = null;
    let targetFunctionName = null;
    
    if (currentContext && currentContext.functionId) {
      // Use currently selected function
      targetFunctionId = currentContext.functionId;
      
      // Find the function name from the loaded data
      if (state.functionsData?.functions) {
        const func = state.functionsData.functions.find(f => f.address === targetFunctionId);
        if (func && func.name) {
          targetFunctionName = func.name;
        }
      }
      targetFunctionName = targetFunctionName || `Function ${targetFunctionId}`;
    } else {
      // No function currently selected, try to find one with loaded data
      if (customizations.notes || customizations.tags) {
        // Look for a function that has notes or tags
        const functionsWithData = new Set([
          ...Object.keys(customizations.notes || {}),
          ...Object.keys(customizations.tags || {})
        ]);
        
        if (functionsWithData.size > 0) {
          targetFunctionId = Array.from(functionsWithData)[0];
          
          // Find the function name
          if (state.functionsData?.functions) {
            const func = state.functionsData.functions.find(f => f.address === targetFunctionId);
            if (func && func.name) {
              targetFunctionName = func.name;
            }
          }
          targetFunctionName = targetFunctionName || `Function ${targetFunctionId}`;
          
          console.log(`Auto-selecting function ${targetFunctionName} (${targetFunctionId}) to show loaded project data`);
        }
      }
    }
    
    if (targetFunctionId) {
      // Dispatch events to refresh the notes/tags display
      setTimeout(() => {
        console.log(`Refreshing TagNotes panel for function ${targetFunctionName} (${targetFunctionId})`);
        
        // Dispatch function-selected event to trigger note/tag loading
        window.dispatchEvent(new CustomEvent('function-selected', {
          detail: {
            functionId: targetFunctionId,
            functionName: targetFunctionName
          }
        }));
      }, 500); // Small delay to ensure binary-loaded event is processed first
    }
  } catch (error) {
    console.warn('Could not refresh TagNotes panel:', error);
  }
  
  console.log('Project customizations applied successfully');
}

/**
 * Apply custom function names
 */
async function applyCustomFunctionNames(functionNames) {
  if (!state.functionsData?.functions) return;
  
  let appliedCount = 0;
  state.functionsData.functions.forEach(func => {
    // Check if there's a custom name for this function's current name (original name)
    if (functionNames[func.name]) {
      const customName = functionNames[func.name];
      const originalName = func.name;
      
      // Set the original name for tracking (if not already set)
      if (!func.originalName) {
        func.originalName = func.name;
      }
      
      // Apply the custom name
      func.name = customName;
      appliedCount++;
      
      // CRITICAL: Update pseudocode content to replace original name with custom name
      if (func.pseudocode) {
        try {
          // Create a regex that matches the function name as a whole word
          const regex = new RegExp(`\\b${originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
          const updatedPseudocode = func.pseudocode.replace(regex, customName);
          
          if (updatedPseudocode !== func.pseudocode) {
            func.pseudocode = updatedPseudocode;
            console.log(`Updated pseudocode for function "${originalName}" -> "${customName}"`);
            
            // If this is the currently displayed function, update the Monaco editor
            if (state.currentFunction && state.currentFunction.address === func.address) {
              state.currentFunction.pseudocode = updatedPseudocode;
              state.currentFunction.name = customName;
              if (!state.currentFunction.originalName) {
                state.currentFunction.originalName = originalName;
              }
              
              // Update Monaco editor immediately
              if (window.updateMonacoEditorContent) {
                window.updateMonacoEditorContent(updatedPseudocode);
              }
              
              // Update function name display
              const functionNameEl = document.getElementById('function-name');
              if (functionNameEl) {
                functionNameEl.textContent = customName;
                functionNameEl.setAttribute('data-function-name', customName);
              }
            }
          }
        } catch (error) {
          console.error(`Error updating pseudocode for function ${originalName}:`, error);
        }
      }
      
      console.log(`Applied function rename: "${func.originalName}" -> "${func.name}"`);
    }
  });
  
  console.log(`Applied ${appliedCount} custom function names`);
}

/**
 * Apply custom variable names
 */
async function applyCustomVariableNames(variableNames) {
  if (!state.functionsData?.functions) return;
  
  let appliedCount = 0;
  state.functionsData.functions.forEach(func => {
    if (variableNames[func.address] && func.local_variables) {
      const funcVarNames = variableNames[func.address];
      let functionPseudocodeUpdated = false;
      let updatedPseudocode = func.pseudocode;
      
      func.local_variables.forEach(variable => {
        // Check if there's a custom name for this variable's current name (original name)
        if (funcVarNames[variable.name]) {
          const customName = funcVarNames[variable.name];
          const originalName = variable.name;
          
          // Set the original name for tracking (if not already set)
          if (!variable.originalName) {
            variable.originalName = variable.name;
          }
          
          // Apply the custom name
          variable.name = customName;
          appliedCount++;
          
          // CRITICAL: Update pseudocode content to replace original variable name with custom name
          if (updatedPseudocode) {
            try {
              // Create a regex that matches the variable name as a whole word
              const regex = new RegExp(`\\b${originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
              const newPseudocode = updatedPseudocode.replace(regex, customName);
              
              if (newPseudocode !== updatedPseudocode) {
                updatedPseudocode = newPseudocode;
                functionPseudocodeUpdated = true;
                console.log(`Updated pseudocode for variable "${originalName}" -> "${customName}" in function ${func.address}`);
              }
            } catch (error) {
              console.error(`Error updating pseudocode for variable ${originalName}:`, error);
            }
          }
          
          console.log(`Applied variable rename: "${variable.originalName}" -> "${variable.name}"`);
        }
      });
      
      // If pseudocode was updated, apply it to the function
      if (functionPseudocodeUpdated && updatedPseudocode !== func.pseudocode) {
        func.pseudocode = updatedPseudocode;
        
        // If this is the currently displayed function, update the Monaco editor
        if (state.currentFunction && state.currentFunction.address === func.address) {
          state.currentFunction.pseudocode = updatedPseudocode;
          
          // Update Monaco editor immediately
          if (window.updateMonacoEditorContent) {
            window.updateMonacoEditorContent(updatedPseudocode);
          }
        }
      }
    }
  });
  
  console.log(`Applied ${appliedCount} custom variable names`);
}

/**
 * Apply notes to functions
 */
async function applyNotes(notes) {
  const binaryName = await cleanBinaryName(getCurrentBinaryName());
  let appliedCount = 0;
  
  for (const [functionAddress, noteContent] of Object.entries(notes)) {
    try {
      const response = await fetch(`http://localhost:8000/api/notes/${binaryName}/${functionAddress}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: noteContent })
      });
      
      if (response.ok) {
        appliedCount++;
      }
    } catch (error) {
      console.warn(`Failed to apply note for function ${functionAddress}:`, error);
    }
  }
  
  console.log(`Applied ${appliedCount} function notes`);
  
  // Also update frontend note editor if it's currently showing one of these functions
  try {
    const { getCurrentContext } = await import('./TagNotePanel.js');
    const { setNoteContent } = await import('./NoteEditor.js');
    
    const currentContext = getCurrentContext();
    if (currentContext && currentContext.functionId && notes[currentContext.functionId]) {
      console.log(`Updating note editor with loaded content for function ${currentContext.functionId}`);
      setNoteContent(notes[currentContext.functionId]);
    }
  } catch (error) {
    console.warn('Could not update frontend note editor:', error);
  }
}

/**
 * Apply tags to functions
 */
async function applyTags(tags) {
  const binaryName = await cleanBinaryName(getCurrentBinaryName());
  let appliedCount = 0;
  
  for (const [functionAddress, functionTags] of Object.entries(tags)) {
    try {
      const response = await fetch(`http://localhost:8000/api/tags/${binaryName}/${functionAddress}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags: functionTags })
      });
      
      if (response.ok) {
        appliedCount++;
      }
    } catch (error) {
      console.warn(`Failed to apply tags for function ${functionAddress}:`, error);
    }
  }
  
  console.log(`Applied tags for ${appliedCount} functions`);
  
  // Also update frontend tags panel if it's currently showing one of these functions
  try {
    const { getCurrentContext } = await import('./TagNotePanel.js');
    
    const currentContext = getCurrentContext();
    if (currentContext && currentContext.functionId && tags[currentContext.functionId]) {
      console.log(`Updating tags panel with loaded tags for function ${currentContext.functionId}`);
      
      // Directly update the tags panel state
      const { setCurrentTags } = await import('./TagsPanel.js');
      setCurrentTags(tags[currentContext.functionId]);
    }
  } catch (error) {
    console.warn('Could not update frontend tags panel:', error);
  }
}

/**
 * Restore chat sessions
 */
async function restoreChatSessions(sessions) {
  if (!sessions || sessions.length === 0) {
    console.log('No chat sessions to restore');
    return;
  }
  
  console.log(`Restoring ${sessions.length} chat sessions...`);
  console.log('Sessions to restore:', sessions);
  
  try {
    // Restore each session by recreating it in the backend
    let restoredCount = 0;
    
    for (const session of sessions) {
      try {
        console.log(`Restoring session: ${session.session_id} - "${session.name}"`);
        console.log(`Session has ${session.messages?.length || 0} messages`);
        
        // Create the session in the backend with the original data
        const response = await fetch('http://localhost:8000/api/chat/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: session.session_id,
            name: session.name,
            created_at: session.created_at,
            last_activity: session.last_activity,
            messages: session.messages || []
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`✓ Restored session: ${session.session_id} - Backend response:`, result);
          restoredCount++;
        } else {
          const errorText = await response.text();
          console.warn(`✗ Failed to restore session ${session.session_id}: ${response.status} ${response.statusText} - ${errorText}`);
        }
      } catch (error) {
        console.warn(`✗ Error restoring session ${session.session_id}:`, error);
      }
    }
    
    console.log(`Successfully restored ${restoredCount} of ${sessions.length} chat sessions`);
    
    // Refresh the frontend chat system to show the restored sessions
    if (restoredCount > 0) {
      console.log('Refreshing chat sessions in UI...');
      
      // Import and call the refresh function
      try {
        const { refreshChatSessions } = await import('./chat.js');
        console.log('About to call refreshChatSessions...');
        await refreshChatSessions();
        console.log('Chat sessions refreshed in UI');
        
        // Also check what sessions are now available
        const sessionsResponse = await window.electronAPI.listChatSessions();
        console.log('Available sessions after refresh:', sessionsResponse);
      } catch (error) {
        console.warn('Could not refresh chat sessions UI:', error);
      }
    }
    
  } catch (error) {
    console.error('Error during chat session restoration:', error);
  }
}

/**
 * Show success message to user
 */
function showSuccessMessage(message) {
  // Create a simple success notification
  const notification = document.createElement('div');
  notification.className = 'project-notification success';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * Show error message to user
 */
function showErrorMessage(message) {
  // Use existing error modal if available, otherwise alert
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
  
  // TODO: Check for notes, tags, chat sessions via API calls
  // For now, assume there might be customizations
  return true;
}

/**
 * Apply project data that has already been loaded
 */
export async function applyProjectData(projectData) {
  try {
    console.log(`Applying project: ${projectData.aetherre_project.name}`);
    
    // Validate we have a binary loaded first
    if (!state.originalBinaryName || !state.currentFilePath) {
      throw new Error("Please load the target binary first, then load the project file.");
    }
    
    // Verify binary hash matches
    const currentHash = await calculateBinaryHash();
    if (projectData.target_binary.sha256 !== currentHash) {
      throw new Error(
        `Project file mismatch!\n\n` +
        `Project expects: ${projectData.target_binary.filename}\n` +
        `You have loaded: ${state.originalBinaryName}\n\n` +
        `Please load the correct binary file first.`
      );
    }
    
    // Apply customizations
    console.log("Applying project customizations...");
    await applyProjectCustomizations(projectData);
    
    console.log(`Project "${projectData.aetherre_project.name}" applied successfully!`);
    return true;
    
  } catch (error) {
    console.error('Error applying project data:', error);
    throw error;
  }
} 