// Global state management
export const state = {
  monacoEditor: null,
  assemblyEditor: null,
  functionsData: null,
  currentFunction: null,
  currentFilePath: null,
  originalBinaryName: null,
  cfgInstance: null,
  currentSessionId: null
};

// Re-export state variables as global variables for compatibility
export function exposeGlobals() {
  window.monacoEditor = state.monacoEditor;
  window.assemblyEditor = state.assemblyEditor;
  window.functionsData = state.functionsData;
  window.currentFunction = state.currentFunction;
  window.currentFilePath = state.currentFilePath;
  window.originalBinaryName = state.originalBinaryName;
  window.cfgInstance = state.cfgInstance;
  window.currentSessionId = state.currentSessionId;
  
  // Set up property listeners to keep globals in sync with state
  Object.keys(state).forEach(key => {
    let currentValue = state[key];
    Object.defineProperty(state, key, {
      get: function() { return currentValue; },
      set: function(newValue) { 
        currentValue = newValue; 
        window[key] = newValue; // Update global variable when state changes
      }
    });
  });
  
  console.log("Global variables exposed and synchronized with state");
}

// Update UI when a file is loaded
export function updateUIWithFile(fileName) {
  // Update the document title
  document.title = `AetherRE - ${fileName}`;
  
  // Update the header if needed
  const headerElement = document.querySelector('.app-header h1');
  if (headerElement) {
    headerElement.textContent = 'AetherRE';
    const fileSpan = document.createElement('span');
    fileSpan.className = 'current-file';
    fileSpan.textContent = fileName;
    headerElement.appendChild(fileSpan);
  }
  
  console.log(`UI updated with file: ${fileName}`);
}

// Main init function to initialize all modules
export function init() {
  // The modules will be imported and initialized via the main renderer.js
  // This function will be called after all module imports are complete
  
  // Also ensure Monaco editors layout after a short delay on load
  setTimeout(() => {
    if (state.monacoEditor && state.monacoEditor.layout) state.monacoEditor.layout();
    if (state.assemblyEditor && state.assemblyEditor.layout) state.assemblyEditor.layout();
  }, 150);

  // Also ensure layout after any window resize
  window.addEventListener('resize', () => {
    if (state.monacoEditor && state.monacoEditor.layout) state.monacoEditor.layout();
    if (state.assemblyEditor && state.assemblyEditor.layout) state.assemblyEditor.layout();
  });

  // Configure marked options for better markdown rendering
  if (window.marked) {
    marked.setOptions({
      gfm: true, // Enable GitHub Flavored Markdown
      breaks: true, // Add <br> on single line breaks
      headerIds: false, // Disable header IDs to prevent XSS
      mangle: false, // Disable mangling to prevent XSS
      smartLists: true, // Use smarter list behavior
      smartypants: true, // Use smart punctuation
      highlight: function(code, lang) {
        if (window.hljs && lang) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {
            return code;
          }
        }
        return code;
      }
    });
  }
}

// Helper function to find function name
export function getFunctionName(addressOrName) {
  if (!addressOrName) return null;
  if (!state.functionsData || !state.functionsData.functions) return addressOrName;
  
  // First try to find by exact address match
  const func = state.functionsData.functions.find(f => f.address === addressOrName);
  if (func) return func.name;
  
  // Try with/without 0x prefix
  const normalizedAddr = addressOrName.startsWith('0x') ? 
      addressOrName.substring(2) : 
      '0x' + addressOrName;
  const funcByNormalizedAddr = state.functionsData.functions.find(f => 
      f.address === normalizedAddr || 
      f.address === normalizedAddr.toLowerCase() || 
      f.address === normalizedAddr.toUpperCase()
  );
  if (funcByNormalizedAddr) return funcByNormalizedAddr.name;
  
  // If not found by address, check if it's already a name
  const funcByName = state.functionsData.functions.find(f => 
      f.name === addressOrName || 
      f.name.toLowerCase() === addressOrName.toLowerCase()
  );
  if (funcByName) return funcByName.name;
  
  // If we can't find it, return the original value
  return addressOrName;
}

// Helper function to find function
export function findFunction(addressOrName) {
  if (!state.functionsData || !state.functionsData.functions) return null;
  
  // Try exact match first
  let func = state.functionsData.functions.find(f => 
      f.address === addressOrName || 
      f.name === addressOrName
  );
  
  if (func) return func;
  
  // Try with/without 0x prefix
  const normalizedAddr = addressOrName.startsWith('0x') ? 
      addressOrName.substring(2) : 
      '0x' + addressOrName;
  
  // Try to find with normalized address
  func = state.functionsData.functions.find(f => 
      f.address === normalizedAddr || 
      f.address === normalizedAddr.toLowerCase() || 
      f.address === normalizedAddr.toUpperCase()
  );
  
  if (func) return func;
  
  // Try with normalized name (case insensitive)
  func = state.functionsData.functions.find(f => 
      f.name.toLowerCase() === addressOrName.toLowerCase()
  );
  
  return func;
} 