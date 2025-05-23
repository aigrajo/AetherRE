import { state } from './core.js';
import { updateUIWithFile } from './core.js';
import { renderFunctionList } from './functionManager.js';
import { saveProject, loadProject, getProjectInfo, collectProjectData, applyProjectData } from './projectManager.js';

// Initialize file handling
export function initFileHandling() {
  console.log('[FILEHANDLER] initFileHandling called');
  
  try {
    console.log('[FILEHANDLER] Getting DOM elements...');
  const loadFileBtn = document.getElementById('load-file-btn');
  const fileInput = document.getElementById('file-input');
    const projectInput = document.getElementById('project-input');
  const progressContainer = document.getElementById('analysis-progress');
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  const appHeader = document.querySelector('.app-header');
    
    console.log('[FILEHANDLER] DOM elements found:', {
      loadFileBtn: !!loadFileBtn,
      fileInput: !!fileInput,
      projectInput: !!projectInput,
      progressContainer: !!progressContainer,
      progressFill: !!progressFill,
      progressText: !!progressText,
      appHeader: !!appHeader
    });
    
    // Set up menu action listeners with a small delay to ensure everything is loaded
    setTimeout(() => {
      console.log('About to setup menu listeners...');
      setupMenuListeners();
    }, 100);
    
    console.log('[FILEHANDLER] Setting up file input listeners...');
  
  loadFileBtn.addEventListener('click', () => {
    fileInput.click();
  });

    // Project file input handler (triggered by menu)
    projectInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        // Use file.path for Electron file access
        await loadProject(file.path);
      } finally {
        // Clear input
        projectInput.value = '';
      }
    });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const isBinary = !file.name.endsWith('.json');
      
      try {
        // Use file.path for Electron file access, or fallback to webkitRelativePath
        const filePath = file.path || file.webkitRelativePath;
        await processSelectedFile(filePath, file.name, isBinary);
      } catch (error) {
        console.error('Error processing file:', error);
        // Show error to user
        alert(`Error processing file: ${error.message}`);
      }
    });
  } catch (error) {
    console.error('Error initializing file handling:', error);
  }
}

/**
 * Set up menu action listeners
 */
function setupMenuListeners() {
  console.log('Setting up menu listeners...');
  console.log('window.api exists:', !!window.api);
  console.log('window.electronAPI exists:', !!window.electronAPI);
  
  if (window.api) {
    console.log('window.api methods:', Object.keys(window.api));
  }
  
  if (window.api && window.api.onMenuAction) {
    console.log('Menu action API available, setting up listener...');
    window.api.onMenuAction((event, action) => {
      console.log('Menu action received:', action);
      
      switch (action) {
        case 'load-file':
          console.log('Showing binary file dialog...');
          handleLoadFileFromMenu();
          break;
        case 'save-project':
          console.log('Triggering save project...');
          handleSaveProject();
          break;
        case 'save-project-as':
          console.log('Triggering save project as...');
          handleSaveProjectAs();
          break;
        case 'load-project':
          console.log('Loading project from menu...');
          handleLoadProjectFromMenu();
          break;
        default:
          console.log('Unknown menu action:', action);
      }
    });
  } else {
    console.error('Menu action API not available!');
    console.log('window.api exists:', !!window.api);
    if (window.api) {
      console.log('window.api methods:', Object.keys(window.api));
    }
  }
}

/**
 * Handle save project from menu
 */
async function handleSaveProject() {
  const projectInfo = getProjectInfo();
  if (!projectInfo) {
    alert('No binary loaded. Please load a binary file first.');
    return;
  }

  try {
    console.log('Starting save project process...');
    console.log('Project info:', projectInfo);
    console.log('Current project file:', state.currentProjectFile);
    
    // Collect project data first
    console.log('Collecting project data...');
    const projectData = await collectProjectData();
    if (!projectData) {
      alert('Failed to collect project data. Please try again.');
      return;
    }

    console.log('Project data collected successfully');
    console.log('Data summary:', {
      functionNames: Object.keys(projectData.customizations?.function_names || {}).length,
      variableNames: Object.keys(projectData.customizations?.variable_names || {}).length,
      notes: Object.keys(projectData.customizations?.notes || {}).length,
      tags: Object.keys(projectData.customizations?.tags || {}).length,
      chatSessions: projectData.chat_history?.sessions?.length || 0
    });

    let success = false;

    // If we have a current project file, save directly to it
    if (state.currentProjectFile) {
      console.log(`Saving to existing project file: ${state.currentProjectFile}`);
      try {
        // Save directly to the existing file using Electron API
        await window.electronAPI.writeProjectFile(state.currentProjectFile, projectData);
        success = true;
        console.log('Project saved to existing file successfully');
      } catch (error) {
        console.error('Failed to save to existing file:', error);
        alert(`Failed to save project: ${error.message}`);
        return;
      }
    } else {
      // No current project file, behave like "Save As"
      console.log('No current project file, showing save dialog...');
      const defaultFilename = `${projectInfo.binaryName}.aetherre`;
      console.log('Default filename:', defaultFilename);
      
      const result = await window.api.showProjectSaveDialog(projectData, defaultFilename);
      if (result && result.success) {
        success = true;
        // Update the current project file path for future saves
        state.currentProjectFile = result.filePath;
        console.log(`Project saved to new file: ${result.filePath}`);
        console.log(`Current project file updated to: ${state.currentProjectFile}`);
      } else {
        console.log('Save operation was cancelled by user');
        return;
      }
    }

    if (success) {
      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'notification success';
      notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 12px 24px; border-radius: 4px; z-index: 10000; font-size: 14px;';
      notification.textContent = state.currentProjectFile ? 
        `Project saved to ${state.currentProjectFile.split(/[\\/]/).pop()}` : 
        'Project saved successfully!';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    }
  } catch (error) {
    console.error('Error saving project:', error);
    alert(`Error saving project: ${error.message}`);
  }
}

/**
 * Handle save project as from menu
 */
async function handleSaveProjectAs() {
  const projectInfo = getProjectInfo();
  if (!projectInfo) {
    alert('No binary loaded. Please load a binary file first.');
    return;
  }

  try {
    console.log('Starting save project as process...');
    console.log('Collecting project data...');
    const projectData = await collectProjectData();
    if (!projectData) {
      alert('Failed to collect project data. Please try again.');
      return;
    }

    const defaultFilename = `${projectInfo.binaryName}.aetherre`;
    console.log('Showing save as dialog...');
    
    const result = await window.api.showProjectSaveDialog(projectData, defaultFilename);
    if (result && result.success) {
      // Update the current project file path for future saves
      state.currentProjectFile = result.filePath;
      console.log(`Project saved as: ${result.filePath}`);
      console.log(`Current project file updated to: ${state.currentProjectFile}`);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'notification success';
      notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 12px 24px; border-radius: 4px; z-index: 10000; font-size: 14px;';
      notification.textContent = `Project saved as ${result.filePath.split(/[\\/]/).pop()}`;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    } else {
      console.log('Save as operation was cancelled by user');
    }
  } catch (error) {
    console.error('Error saving project as:', error);
    alert(`Error saving project: ${error.message}`);
  }
}

/**
 * Handle load file from menu
 */
async function handleLoadFileFromMenu() {
  try {
    console.log('Requesting binary file dialog...');
    const filePath = await window.api.showBinaryDialog();
    
    if (!filePath) {
      console.log('No file selected');
      return;
    }
    
    console.log('File selected:', filePath);
    
    // Extract filename
    const filename = filePath.split(/[\\/]/).pop();
    const isBinary = !filename.endsWith('.json');
    
    // Process the file
    await processSelectedFile(filePath, filename, isBinary);
    
  } catch (error) {
    console.error('Error loading file from menu:', error);
    alert(`Error loading file: ${error.message}`);
  }
}

/**
 * Handle load project from menu
 */
async function handleLoadProjectFromMenu() {
  try {
    console.log('Showing project load dialog...');
    const result = await window.api.showProjectLoadDialog();
    
    if (!result || !result.projectData) {
      console.log('No project selected');
      return;
    }
    
    console.log('Project data loaded, applying...');
    console.log('Project file path:', result.filePath);
    
    // Use the imported applyProjectData function
    await applyProjectData(result.projectData);
    
    // Track the loaded project file for future saves
    state.currentProjectFile = result.filePath;
    console.log(`Current project file set to: ${state.currentProjectFile}`);
    
    // Show success notification
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 12px 24px; border-radius: 4px; z-index: 10000; font-size: 14px;';
    notification.textContent = `Project "${result.projectData.aetherre_project.name}" loaded successfully!`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
    
  } catch (error) {
    console.error('Error loading project from menu:', error);
    alert(`Error loading project: ${error.message}`);
  }
}

/**
 * Clean up old notes and tags files for a new binary analysis
 */
async function cleanupOldMetadata(binaryName) {
  const cleanBinaryName = binaryName.replace(/[^\w\d]/g, '_');
  
  try {
    // Request backend to clean up old files for this binary
    const response = await fetch(`http://localhost:8000/api/cleanup/${cleanBinaryName}`, {
      method: 'POST'
    });
    
    if (response.ok) {
      console.log(`Cleaned up old metadata files for ${cleanBinaryName}`);
    } else {
      console.warn(`Failed to cleanup metadata files: ${response.statusText}`);
    }
  } catch (error) {
    console.warn('Error cleaning up metadata files:', error);
  }
}

/**
 * Process a selected file (shared logic for menu and file input)
 */
export async function processSelectedFile(filePath, filename, isBinary) {
  const progressContainer = document.getElementById('analysis-progress');
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  const appHeader = document.querySelector('.app-header');
    
    try {
      if (!window.api) {
        throw new Error('API not available - please restart the application');
      }

      if (isBinary) {
        // Store original binary name
        state.originalBinaryName = filename;
        
        // Clear current project file when loading a new binary
        state.currentProjectFile = null;
        console.log('Cleared current project file - new binary loaded');
        
        // Show progress bar and hide load button
        progressContainer.style.display = 'flex';
        appHeader.classList.add('analyzing');
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting analysis...';

        // Start binary analysis
        const result = await window.api.analyzeBinary(filePath, (progress) => {
          // Update progress bar
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `Analyzing binary... ${progress}%`;
        });

        // Hide progress bar and show load button
        progressContainer.style.display = 'none';
        appHeader.classList.remove('analyzing');
        
        if (result) {
          state.functionsData = result.data;
          window.currentData = state.functionsData;
          state.currentFilePath = result.path;
          updateUIWithFile(state.originalBinaryName);
          renderFunctionList(state.functionsData.functions);
        
        // Clean up old metadata files for fresh start
        await cleanupOldMetadata(state.originalBinaryName);
        
        // Enable project menu items now that we have a binary loaded
        enableProjectMenu();
          
          // Dispatch binary loaded event for TagNote panel
          console.log(`Binary loaded: ${state.originalBinaryName}`);
          window.dispatchEvent(new CustomEvent('binary-loaded', {
            detail: {
              binaryName: state.originalBinaryName
            }
          }));
        }
      } else {
        // For JSON files, try to extract original binary name from the data
        const result = await window.api.loadJsonFile(filePath);
        if (result) {
          state.functionsData = result.data;
          window.currentData = state.functionsData;
          state.currentFilePath = result.path;
          
          // Try to get original binary name from the analysis data
          state.originalBinaryName = state.functionsData.metadata?.originalBinary || 
                                  state.functionsData.originalBinary ||
                                filename.replace('.json', '');
          
          // Clear current project file when loading JSON analysis data
          state.currentProjectFile = null;
          console.log('Cleared current project file - JSON analysis loaded');
          
          updateUIWithFile(state.originalBinaryName);
          renderFunctionList(state.functionsData.functions);
        
        // For JSON files, don't clean up metadata since user might want to preserve it
        // unless they explicitly load a project file
        
        // Enable project menu items for JSON files too
        enableProjectMenu();
          
          // Dispatch binary loaded event for TagNote panel
          window.dispatchEvent(new CustomEvent('binary-loaded', {
            detail: {
              binaryName: state.originalBinaryName
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      progressContainer.style.display = 'none';
      appHeader.classList.remove('analyzing');
    throw error;
  }
}

/**
 * Enable project menu items
 */
function enableProjectMenu() {
  if (window.api && window.api.enableProjectMenu) {
    window.api.enableProjectMenu(true);
    }
}

// Check if there are any recent analyses
export async function checkRecentAnalyses() {
  try {
    if (!window.api) {
      console.warn('API not available - skipping recent analyses check');
      return;
    }
    const files = await window.api.getAnalysisFiles();
    if (files.length > 0) {
      // Could display recent files here or auto-load the most recent
      console.log('Recent analysis files:', files);
    }
  } catch (error) {
    console.error('Error checking recent analyses:', error);
  }
} 