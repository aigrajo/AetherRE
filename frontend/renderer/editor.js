import { state } from './core.js';

// Debugging
const DEBUG = true;
function debugLog(...args) {
  if (DEBUG) {
    console.log('[Editor]', ...args);
  }
}

// Initialize Monaco Editor
export function initMonacoEditor() {
  debugLog("Initializing Monaco editor");
  
  // Load Monaco from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js';
  script.onload = () => {
    debugLog("Monaco loader script loaded");
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
      debugLog("Monaco main module loaded");
      
      // Initialize pseudocode editor
      state.monacoEditor = monaco.editor.create(document.getElementById('pseudocode-editor'), {
        value: '// Load a binary analysis file to view pseudocode',
        language: 'cpp',
        theme: 'vs-dark',
        readOnly: true,
        minimap: {
          enabled: true
        },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 14,
        fontFamily: "'Consolas', 'Courier New', monospace",
        renderLineHighlight: 'all'
      });
      
      debugLog("Pseudocode editor created");

      // Initialize assembly editor
      state.assemblyEditor = monaco.editor.create(document.getElementById('assembly-editor'), {
        value: '// Load a binary analysis file to view assembly',
        language: 'asm',
        theme: 'vs-dark',
        readOnly: true,
        minimap: {
          enabled: true
        },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 14,
        fontFamily: "'Consolas', 'Courier New', monospace",
        renderLineHighlight: 'all'
      });
      
      debugLog("Assembly editor created");
      
      // Attach content change listeners to detect updates
      if (state.monacoEditor) {
        state.monacoEditor.onDidChangeModelContent(e => {
          debugLog("Monaco editor content changed", e);
        });
      }
      
      // Resize editors when window resizes
      window.addEventListener('resize', () => {
        debugLog("Window resize detected, updating editor layouts");
        if (state.monacoEditor) {
          state.monacoEditor.layout();
        }
        if (state.assemblyEditor) {
          state.assemblyEditor.layout();
        }
      });
      
      // Create direct function to update editor content for reliable updates
      window.updateMonacoEditorContent = function(content) {
        debugLog(`Direct update to Monaco editor content (${content ? content.length : 0} chars)`);
        if (state.monacoEditor && content) {
          const model = state.monacoEditor.getModel();
          if (model) {
            model.setValue(content);
            state.monacoEditor.layout();
          } else {
            state.monacoEditor.setValue(content);
          }
        }
      };
      
      debugLog("Monaco editors fully initialized");
    });
  };
  document.head.appendChild(script);
} 