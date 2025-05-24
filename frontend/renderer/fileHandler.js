import { state } from './core.js';
import { updateUIWithFile } from './core.js';
import { renderFunctionList } from './functionManager.js';
import { loadProject, getProjectInfo, collectProjectData, applyProjectData } from './projectManager.js';

// Backend file service API base URL
const FILE_API_BASE = 'http://localhost:8000/api/files';

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

      try {
        // Use file.path for Electron file access, or fallback to webkitRelativePath
        const filePath = file.path || file.webkitRelativePath;
        await processSelectedFile(filePath);
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
    
    // Collect project data using the enhanced backend service
    console.log('Collecting project data...');
    const projectData = await collectProjectData();
    if (!projectData) {
      alert('Failed to collect project data. Please try again.');
      return;
    }

    console.log('Project data collected successfully');

    let success = false;

    // If we have a current project file, save directly to it
    if (state.currentProjectFile) {
      console.log(`Saving to existing project file: ${state.currentProjectFile}`);
      console.log('Checking if writeProjectFile API exists:', !!window.electronAPI.writeProjectFile);
      try {
        // Save directly to the existing file using Electron API
        const result = await window.electronAPI.writeProjectFile(state.currentProjectFile, projectData);
        console.log('writeProjectFile result:', result);
        success = true;
        console.log('Project saved to existing file successfully');
      } catch (error) {
        console.error('Failed to save to existing file:', error);
        console.error('Error details:', error.message, error.stack);
        alert(`Failed to save project: ${error.message}`);
        return;
      }
    } else {
      // No current project file, behave like "Save As"
      console.log('No current project file, showing save dialog...');
      
      // Use backend service to generate default filename
      const defaultFilename = await generateDefaultProjectFilename(projectInfo.binaryName);
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
      // Show success notification using the backend extracted filename
      const filename = await extractFilename(state.currentProjectFile);
      showNotification(`Project saved to ${filename}`, 'success');
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
    
    // Collect project data using the enhanced backend service
    console.log('Collecting project data...');
    const projectData = await collectProjectData();
    if (!projectData) {
      alert('Failed to collect project data. Please try again.');
      return;
    }

    // Use backend service to generate default filename
    const defaultFilename = await generateDefaultProjectFilename(projectInfo.binaryName);
    console.log('Showing save as dialog...');
    
    const result = await window.api.showProjectSaveDialog(projectData, defaultFilename);
    if (result && result.success) {
      // Update the current project file path for future saves
      state.currentProjectFile = result.filePath;
      console.log(`Project saved as: ${result.filePath}`);
      console.log(`Current project file updated to: ${state.currentProjectFile}`);
      
      // Show success notification using the backend extracted filename
      const filename = await extractFilename(result.filePath);
      showNotification(`Project saved as ${filename}`, 'success');
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
    
    // Process the file using backend file detection
    await processSelectedFile(filePath);
    
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
  try {
    // Use backend service to sanitize binary name
    const sanitizedName = await sanitizeBinaryName(binaryName);
    
    // Request backend to clean up old files for this binary
    const response = await fetch(`http://localhost:8000/api/cleanup/${sanitizedName}`, {
      method: 'POST'
    });
    
    if (response.ok) {
      console.log(`Cleaned up old metadata files for ${sanitizedName}`);
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
export async function processSelectedFile(filePath) {
  const progressContainer = document.getElementById('analysis-progress');
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  const appHeader = document.querySelector('.app-header');
    
  try {
    if (!window.api) {
      throw new Error('API not available - please restart the application');
    }

    // Use backend service to detect file type and validate
    console.log('Detecting file type...');
    const fileInfo = await detectFileType(filePath);
    
    if (!fileInfo.is_valid) {
      throw new Error(fileInfo.error || 'Invalid file type');
    }

    console.log('File type detected:', fileInfo);

    if (fileInfo.file_type === 'binary') {
      // Store original binary name
      state.originalBinaryName = fileInfo.filename;
      
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
    } else if (fileInfo.file_type === 'json_analysis') {
      // For JSON files, load the analysis data
      const result = await window.api.loadJsonFile(filePath);
      if (result) {
        state.functionsData = result.data;
        window.currentData = state.functionsData;
        state.currentFilePath = result.path;
        
        // Use backend service to extract original binary name from analysis data
        state.originalBinaryName = await extractBinaryNameFromAnalysis(
          state.functionsData, 
          fileInfo.filename
        );
        
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
    } else {
      throw new Error(`Unsupported file type: ${fileInfo.file_type}`);
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

// Backend service helper functions
async function detectFileType(filePath) {
  const response = await fetch(`${FILE_API_BASE}/detect-type`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to detect file type: ${response.statusText}`);
  }
  
  return await response.json();
}

async function extractFilename(filePath) {
  const response = await fetch(`${FILE_API_BASE}/extract-filename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to extract filename: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.filename;
}

async function sanitizeBinaryName(binaryName) {
  const response = await fetch(`${FILE_API_BASE}/sanitize-binary-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binary_name: binaryName })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to sanitize binary name: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.sanitized_name;
}

async function generateDefaultProjectFilename(binaryName) {
  const response = await fetch(`${FILE_API_BASE}/generate-default-filename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binary_name: binaryName })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to generate default filename: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.default_filename;
}

async function extractBinaryNameFromAnalysis(analysisData, fallbackFilename) {
  const response = await fetch(`${FILE_API_BASE}/extract-binary-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      analysis_data: analysisData, 
      fallback_filename: fallbackFilename 
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to extract binary name: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.binary_name;
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.style.cssText = `
    position: fixed; 
    top: 20px; 
    right: 20px; 
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'}; 
    color: white; 
    padding: 12px 24px; 
    border-radius: 4px; 
    z-index: 10000; 
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
} 