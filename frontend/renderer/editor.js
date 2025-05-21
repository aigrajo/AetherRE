import { state } from './core.js';

// Initialize Monaco Editor
export function initMonacoEditor() {
  // Load Monaco from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js';
  script.onload = () => {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
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
      
      // Resize editors when window resizes
      window.addEventListener('resize', () => {
        if (state.monacoEditor) {
          state.monacoEditor.layout();
        }
        if (state.assemblyEditor) {
          state.assemblyEditor.layout();
        }
      });
    });
  };
  document.head.appendChild(script);
} 