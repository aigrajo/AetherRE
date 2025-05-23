// Project Manager - Handles saving and loading AetherRE project files
import { state } from './core.js';

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
    // Use the Electron API to calculate hash
    const hash = await window.electronAPI.calculateFileHash(state.currentFilePath);
    return hash;
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
function cleanBinaryName(name) {
  return name.replace(/[^\w\d]/g, '_');
}

/**
 * Collect custom function names from current state
 */
function collectCustomFunctionNames() {
  const customNames = {};
  
  console.log('Collecting custom function names...');
  console.log('state.functionsData:', !!state.functionsData);
  console.log('state.functionsData?.functions length:', state.functionsData?.functions?.length || 0);
  
  if (state.functionsData?.functions) {
    state.functionsData.functions.forEach((func, index) => {
      console.log(`Function ${index}: address=${func.address}, name="${func.name}"`);
      
      // Only save if name was customized (not default Ghidra name pattern)
      if (func.name && !func.name.startsWith('FUN_') && !func.name.startsWith('SUB_')) {
        customNames[func.address] = func.name;
        console.log(`✓ Saving custom function name: ${func.address} -> "${func.name}"`);
      } else {
        console.log(`✗ Skipping default function name: ${func.address} -> "${func.name}"`);
      }
    });
  } else {
    console.warn('No functionsData available for collecting custom function names');
  }
  
  console.log(`Collected ${Object.keys(customNames).length} custom function names:`, customNames);
  return customNames;
}

/**
 * Collect custom variable names from all functions
 */
function collectCustomVariableNames() {
  const variableNames = {};
  
  console.log('Collecting custom variable names...');
  console.log('state.functionsData:', !!state.functionsData);
  console.log('state.functionsData?.functions length:', state.functionsData?.functions?.length || 0);
  
  if (state.functionsData?.functions) {
    state.functionsData.functions.forEach((func, functionIndex) => {
      console.log(`Checking function ${functionIndex}: address=${func.address}, variables=${func.local_variables?.length || 0}`);
      
      if (func.local_variables && Array.isArray(func.local_variables)) {
        const functionVarNames = {};
        
        func.local_variables.forEach((variable, varIndex) => {
          console.log(`  Variable ${varIndex}: name="${variable.name}", originalName="${variable.originalName || 'none'}"`);
          
          // Check if this variable has been renamed (has originalName property)
          if (variable.originalName && variable.name !== variable.originalName) {
            // Store mapping: original name -> custom name
            functionVarNames[variable.originalName] = variable.name;
            console.log(`    ✓ Saving custom variable mapping: "${variable.originalName}" -> "${variable.name}"`);
          } else if (variable.name && 
              !variable.name.startsWith('local_') && 
              !variable.name.startsWith('param_') &&
              !variable.name.startsWith('iVar') &&
              !variable.name.startsWith('uVar') &&
              variable.name !== 'unnamed') {
            
            // Variable was custom named from the start (no original name tracked)
            // This shouldn't happen with proper tracking, but handle it as fallback
            functionVarNames[variable.name] = variable.name;
            console.log(`    ⚠ Saving variable without original name tracking: "${variable.name}"`);
          } else {
            console.log(`    ✗ Skipping default/unchanged variable name: "${variable.name}"`);
          }
        });
        
        if (Object.keys(functionVarNames).length > 0) {
          variableNames[func.address] = functionVarNames;
          console.log(`✓ Function ${func.address} has ${Object.keys(functionVarNames).length} custom variables`);
        } else {
          console.log(`✗ Function ${func.address} has no custom variables`);
        }
      } else {
        console.log(`  Function ${func.address} has no local_variables array`);
      }
    });
  } else {
    console.warn('No functionsData available for collecting custom variable names');
  }
  
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
  const binaryName = cleanBinaryName(getCurrentBinaryName());
  
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
    } else {
      console.log('No current context available for frontend tags collection');
    }
  } catch (error) {
    console.warn('Could not get current tags from TagsPanel:', error);
  }
  
  // For other functions, we still need to query the backend since we don't have
  // a centralized frontend state for all tags
  const binaryName = cleanBinaryName(getCurrentBinaryName());
  
  if (state.functionsData?.functions) {
    console.log(`Checking ${state.functionsData.functions.length} functions for tags...`);
    for (const func of state.functionsData.functions) {
      // Skip if we already got tags for this function from the frontend
      if (tags[func.address]) {
        console.log(`Skipping function ${func.address} - already have tags from frontend`);
        continue;
      }
      
      try {
        const response = await fetch(`http://localhost:8000/api/tags/${binaryName}/${func.address}`);
        if (response.ok) {
          const data = await response.json();
          if (data.tags && data.tags.length > 0) {
            tags[func.address] = data.tags;
            console.log(`Collected ${data.tags.length} tags from backend for function ${func.address}`);
          }
        }
      } catch (error) {
        console.warn(`Failed to get tags for function ${func.address}:`, error);
      }
    }
  }
  
  console.log(`Collected tags for ${Object.keys(tags).length} functions total`);
  return tags;
}

/**
 * Collect chat sessions from the backend
 */
async function collectChatSessions() {
  try {
    console.log('Collecting chat sessions from backend...');
    const response = await window.electronAPI.listChatSessions();
    console.log('Chat sessions response:', response);
    
    if (response && response.sessions) {
      const sessions = response.sessions.map(session => ({
        session_id: session.session_id,
        name: session.name,
        created_at: session.created_at,
        last_activity: session.last_activity,
        message_count: session.message_count,
        messages: session.messages || []
      }));
      
      console.log(`Collected ${sessions.length} chat sessions`);
      return sessions;
    } else {
      console.warn('No sessions found in response:', response);
      return [];
    }
  } catch (error) {
    console.warn('Failed to collect chat sessions:', error);
    return [];
  }
}

/**
 * Save current project to file
 */
export async function saveProject(projectName) {
  try {
    console.log(`Starting project save: ${projectName}`);
    
    // Validate we have a binary loaded
    if (!state.originalBinaryName || !state.currentFilePath) {
      throw new Error("No binary loaded. Please load a binary file first.");
    }

    // Collect project data
    const projectData = await collectProjectData(projectName);
    
    // Save to file using Electron API
    const success = await window.electronAPI.saveProject(projectData, `${projectName}.aetherre`);
    
    if (success) {
      console.log("Project saved successfully");
      showSuccessMessage(`Project "${projectName}" saved successfully!`);
      return true;
    } else {
      throw new Error("Failed to save project file");
    }
    
  } catch (error) {
    console.error('Error saving project:', error);
    showErrorMessage(`Failed to save project: ${error.message}`);
    return false;
  }
}

/**
 * Collect project data without saving
 */
export async function collectProjectData(projectName = null) {
  // Validate we have a binary loaded
  if (!state.originalBinaryName || !state.currentFilePath) {
    throw new Error("No binary loaded. Please load a binary file first.");
  }

  console.log("=== Starting Project Data Collection ===");
  console.log(`Binary: ${state.originalBinaryName}`);
  console.log(`File path: ${state.currentFilePath}`);

  // Calculate binary hash for verification
  console.log("Calculating binary hash...");
  const binaryHash = await calculateBinaryHash();
  console.log(`Binary hash: ${binaryHash}`);
  
  const binaryName = getCurrentBinaryName();
  console.log(`Clean binary name: ${binaryName}`);
  
  // Use provided name or generate default
  const finalProjectName = projectName || state.originalBinaryName.replace(/\.[^/.]+$/, "");
  console.log(`Project name: ${finalProjectName}`);
  
  // Collect all metadata
  console.log("=== Collecting project metadata ===");
  
  console.log("1. Collecting custom function names...");
  const customFunctionNames = collectCustomFunctionNames();
  console.log(`   Result: ${Object.keys(customFunctionNames).length} custom function names`);
  
  console.log("2. Collecting custom variable names...");
  const customVariableNames = collectCustomVariableNames();
  console.log(`   Result: ${Object.keys(customVariableNames).length} functions with custom variables`);
  
  console.log("3. Collecting notes...");
  const notes = await collectAllNotes();
  console.log(`   Result: ${Object.keys(notes).length} functions with notes`);
  
  console.log("4. Collecting tags...");
  const tags = await collectAllTags();
  console.log(`   Result: ${Object.keys(tags).length} functions with tags`);
  
  console.log("5. Collecting chat sessions...");
  const chatSessions = await collectChatSessions();
  console.log(`   Result: ${chatSessions.length} chat sessions`);
  
  console.log("=== Building project data structure ===");
  
  // Build project data structure
  const projectData = {
    aetherre_project: {
      version: PROJECT_VERSION,
      name: finalProjectName,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    },
    target_binary: {
      filename: state.originalBinaryName,
      sha256: binaryHash,
      analysis_started: new Date().toISOString()
    },
    customizations: {
      function_names: customFunctionNames,
      variable_names: customVariableNames,
      notes: notes,
      tags: tags
    },
    chat_history: {
      sessions: chatSessions
    }
  };
  
  console.log("=== Project Data Collection Summary ===");
  console.log(`Function names: ${Object.keys(customFunctionNames).length}`);
  console.log(`Variable names: ${Object.keys(customVariableNames).length}`);
  console.log(`Notes: ${Object.keys(notes).length}`);
  console.log(`Tags: ${Object.keys(tags).length}`);
  console.log(`Chat sessions: ${chatSessions.length}`);
  console.log("=== End Collection Summary ===");
  
  return projectData;
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
    if (functionNames[func.address]) {
      func.name = functionNames[func.address];
      appliedCount++;
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
      
      func.local_variables.forEach(variable => {
        // Check if there's a custom name for this variable's current name (original name)
        if (funcVarNames[variable.name]) {
          const customName = funcVarNames[variable.name];
          
          // Set the original name for tracking (if not already set)
          if (!variable.originalName) {
            variable.originalName = variable.name;
          }
          
          // Apply the custom name
          variable.name = customName;
          appliedCount++;
          
          console.log(`Applied variable rename: "${variable.originalName}" -> "${variable.name}"`);
        }
      });
    }
  });
  
  console.log(`Applied ${appliedCount} custom variable names`);
}

/**
 * Apply notes to functions
 */
async function applyNotes(notes) {
  const binaryName = cleanBinaryName(getCurrentBinaryName());
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
  const binaryName = cleanBinaryName(getCurrentBinaryName());
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