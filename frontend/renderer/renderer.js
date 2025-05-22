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

// Initialize core module immediately to make state available
console.log('Initializing core module...');
coreInit();
exposeGlobals();

// Initialize all modules
async function initApp() {
  console.log('Starting full initialization...');
  
  // Initialize editor
  console.log('Initializing Monaco editor...');
  initMonacoEditor();
  
  // Initialize file handling
  console.log('Initializing file handling...');
  initFileHandling();
  
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