// Main renderer module - Import and initialize all modules
import { state, init as coreInit, exposeGlobals } from './core.js';
import { initMonacoEditor } from './editor.js';
import { initFileHandling, checkRecentAnalyses } from './fileHandler.js';
import { setupFunctionFilter } from './functionManager.js';
import { setupTabSwitching } from './tabManager.js';
import { setupXRefFilters } from './xrefs.js';
import { 
  initializeChatSession, 
  setupChatEventListeners, 
  setupContextToggles 
} from './chat.js';
import { initTagNotePanel } from './TagNotePanel.js';
import { PanelResizer } from '../resize.js';
import { initHistoryManager } from './historyManager.js';
import './modal.js'; // Initialize modal component

// Initialize core module immediately to make state available
console.log('Initializing core module...');
coreInit();
exposeGlobals();

// Handle auto-loading of binary files for analysis
function setupAutoLoad() {
  if (window.api && window.api.onAutoAnalyzeBinary) {
    window.api.onAutoAnalyzeBinary(async (binaryPath) => {
      console.log('Auto-analyzing binary:', binaryPath);
      try {
        // Import the processSelectedFile function from fileHandler
        const { processSelectedFile } = await import('./fileHandler.js');
        
        const filename = binaryPath.split(/[\\/]/).pop();
        await processSelectedFile(binaryPath, filename, true); // true = it's a binary (not JSON)
        
        console.log('Auto-analysis initiated for:', filename);
        
        // Show info notification
        const notification = document.createElement('div');
        notification.className = 'notification info';
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #2196F3; color: white; padding: 12px 24px; border-radius: 4px; z-index: 10000; font-size: 14px;';
        notification.textContent = `Analyzing binary: ${filename}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
        
      } catch (error) {
        console.error('Error auto-analyzing binary:', error);
        
        // Show error notification
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #f44336; color: white; padding: 12px 24px; border-radius: 4px; z-index: 10000; font-size: 14px;';
        notification.textContent = `Failed to analyze: ${error.message}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
      }
    });
  }
}

// Initialize all modules
async function initApp() {
  console.log('Starting full initialization...');
  
  // Initialize editor
  console.log('Initializing Monaco editor...');
  initMonacoEditor();
  
  // Initialize file handling
  console.log('Initializing file handling...');
  initFileHandling();
  
  // Setup auto-load handling
  console.log('Setting up auto-load...');
  setupAutoLoad();
  
  // Check recent analyses
  console.log('Checking recent analyses...');
  await checkRecentAnalyses();
  
  // Setup tab switching
  console.log('Setting up tab switching...');
  setupTabSwitching();
  
  // Setup function filter
  console.log('Setting up function filter...');
  setupFunctionFilter();
  
  // Setup XRef filters
  console.log('Setting up XRef filters...');
  setupXRefFilters();
  
  // Initialize chat
  console.log('Initializing chat...');
  await initializeChatSession();
  
  // Setup chat event listeners
  console.log('Setting up chat event listeners...');
  setupChatEventListeners();
  
  // Setup context toggles
  console.log('Setting up context toggles...');
  setupContextToggles();

  // Initialize TagNote panel
  console.log('Initializing TagNote panel...');
  initTagNotePanel();

  // Initialize panel resizer
  console.log('Initializing panel resizer...');
  new PanelResizer();
  
  // Initialize history manager for undo/redo
  console.log('Initializing history manager...');
  initHistoryManager();
  
  // Ensure state variables are exposed as globals for compatibility
  console.log('Exposing globals for compatibility...');
  exposeGlobals();
  
  // Log startup
  console.log('AetherRE initialized successfully');
}

// Start the app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, initializing AetherRE...');
  initApp().catch(error => {
    console.error('Error initializing AetherRE:', error);
  });
}); 