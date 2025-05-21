import { state } from './core.js';
import { updateUIWithFile } from './core.js';
import { renderFunctionList } from './functionManager.js';

// Initialize file handling
export function initFileHandling() {
  const loadFileBtn = document.getElementById('load-file-btn');
  const fileInput = document.getElementById('file-input');
  const progressContainer = document.getElementById('analysis-progress');
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  const appHeader = document.querySelector('.app-header');
  
  loadFileBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const isBinary = !file.name.endsWith('.json');
    
    try {
      if (!window.api) {
        throw new Error('API not available - please restart the application');
      }

      if (isBinary) {
        // Store original binary name
        state.originalBinaryName = file.name;
        
        // Show progress bar and hide load button
        progressContainer.style.display = 'flex';
        appHeader.classList.add('analyzing');
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting analysis...';

        // Start binary analysis
        const result = await window.api.analyzeBinary(file.path, (progress) => {
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
        }
      } else {
        // For JSON files, try to extract original binary name from the data
        const result = await window.api.loadJsonFile(file.path);
        if (result) {
          state.functionsData = result.data;
          window.currentData = state.functionsData;
          state.currentFilePath = result.path;
          
          // Try to get original binary name from the analysis data
          state.originalBinaryName = state.functionsData.metadata?.originalBinary || 
                                  state.functionsData.originalBinary ||
                                  file.name.replace('.json', '');
          
          updateUIWithFile(state.originalBinaryName);
          renderFunctionList(state.functionsData.functions);
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      progressContainer.style.display = 'none';
      appHeader.classList.remove('analyzing');
      // Show error to user
      alert(`Error processing file: ${error.message}`);
    }
  });
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