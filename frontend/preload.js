console.log('[PRELOAD] Starting preload script...');
console.log('[DEBUG] Module search paths:', module.paths);
console.log('[DEBUG] Current working directory:', process.cwd());

let marked, createDOMPurify, hljs, DOMPurify;

try {
  marked = require('marked');
  console.log('[DEBUG] Marked loaded:', typeof marked);
} catch (e) {
  console.error('[DEBUG] Failed to load marked:', e);
}

try {
  createDOMPurify = require('dompurify');
  console.log('[DEBUG] DOMPurify factory loaded:', typeof createDOMPurify);
} catch (e) {
  console.error('[DEBUG] Failed to load dompurify:', e);
}

try {
  hljs = require('highlight.js');
  console.log('[DEBUG] highlight.js loaded:', typeof hljs);
} catch (e) {
  console.error('[DEBUG] Failed to load highlight.js:', e);
}

try {
  if (createDOMPurify) {
    DOMPurify = createDOMPurify(window);
    console.log('[DEBUG] DOMPurify instance created');
  }
} catch (e) {
  console.error('[DEBUG] Failed to create DOMPurify instance:', e);
}

const { contextBridge, ipcRenderer } = require('electron');

if (marked) contextBridge.exposeInMainWorld('marked', marked);
if (DOMPurify) {
  contextBridge.exposeInMainWorld('DOMPurify', {
    sanitize: (html) => DOMPurify.sanitize(html),
    // Add any other DOMPurify methods that might be needed
    addHook: (entryPoint, hookFunction) => DOMPurify.addHook(entryPoint, hookFunction),
    removeHook: (entryPoint) => DOMPurify.removeHook(entryPoint),
    removeHooks: (entryPoint) => DOMPurify.removeHooks(entryPoint),
    isValidAttribute: (tag, attr, value) => DOMPurify.isValidAttribute(tag, attr, value)
  });
}
if (hljs) contextBridge.exposeInMainWorld('hljs', hljs);

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('api', {
  loadJsonFile: (filePath) => ipcRenderer.invoke('load-json-file', filePath),
  getAnalysisFiles: () => ipcRenderer.invoke('get-analysis-files'),
  analyzeBinary: (filePath, progressCallback) => {
    // Set up progress listener
    const progressListener = (event, progress) => {
      progressCallback(progress);
    };
    ipcRenderer.on('analysis-progress', progressListener);

    // Start analysis and return promise
    return ipcRenderer.invoke('analyze-binary', filePath)
      .finally(() => {
        // Clean up progress listener
        ipcRenderer.removeListener('analysis-progress', progressListener);
      });
  },

  // Project management APIs
  calculateFileHash: (filePath) => ipcRenderer.invoke('calculate-file-hash', filePath),
  saveProject: (projectData, filename) => ipcRenderer.invoke('save-project', projectData, filename),
  loadProject: (defaultPath) => ipcRenderer.invoke('load-project', defaultPath),
  
  // Menu communication
  enableProjectMenu: (enabled) => ipcRenderer.invoke('enable-project-menu', enabled),
  onMenuAction: (callback) => {
    console.log('Setting up menu action listener in preload...');
    ipcRenderer.on('menu-action', (event, action) => {
      console.log('Menu action received in preload:', action);
      callback(event, action);
    });
  },
  
  // Auto-load communication
  onAutoAnalyzeBinary: (callback) => {
    console.log('Setting up auto-analyze binary listener in preload...');
    ipcRenderer.on('auto-analyze-binary', (event, binaryPath) => {
      console.log('Auto-analyze binary event received in preload:', binaryPath);
      callback(binaryPath);
    });
  },
  
  // File dialog APIs
  showBinaryDialog: () => ipcRenderer.invoke('show-binary-dialog'),
  showProjectLoadDialog: () => ipcRenderer.invoke('show-project-load-dialog'),
  showProjectSaveDialog: (projectData, defaultFilename) => ipcRenderer.invoke('show-project-save-dialog', projectData, defaultFilename)
});

console.log('[PRELOAD] API exposed successfully');

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing exposed APIs ...
  
  // Chat API
  sendChatMessage: async (data) => {
    try {
      console.log('[Chat API] Sending request to backend...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Chat API] Server error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      // Stream the response using ReadableStream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullReply = '';
      let buffer = '';
      let sessionId = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                break;
              }
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.reply) {
                  fullReply += parsed.reply;
                  
                  // Dispatch chunk event for streaming updates
                  window.dispatchEvent(new CustomEvent('chat-chunk', {
                    detail: { content: parsed.reply, fullReply }
                  }));
                }
                if (parsed.session_id) {
                  sessionId = parsed.session_id;
                }
              } catch (parseError) {
                console.warn('[Chat API] Failed to parse chunk:', data);
              }
            }
          }
        }
      } catch (streamError) {
        console.error('[Chat API] Stream reading error:', streamError);
        throw streamError;
      }

      return {
        reply: fullReply,
        session_id: sessionId
      };
      
    } catch (error) {
      console.error('[Chat API] Error sending message:', error);
      throw error;
    }
  },

  createNewChat: async () => {
    try {
      const response = await fetch('http://localhost:8000/api/chat/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[Chat API] Error creating new chat:', error);
      throw error;
    }
  },

  listChatSessions: async () => {
    try {
      const response = await fetch('http://localhost:8000/api/chat/sessions');
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[Chat API] Error listing chat sessions:', error);
      throw error;
    }
  },

  clearChatSession: async (sessionId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/chat/sessions/${sessionId}/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[Chat API] Error clearing chat session:', error);
      throw error;
    }
  },

  deleteChatSession: async (sessionId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[Chat API] Error deleting chat session:', error);
      throw error;
    }
  },

  // Project management APIs
  calculateFileHash: (filePath) => ipcRenderer.invoke('calculate-file-hash', filePath),
  saveProject: (projectData, filename) => ipcRenderer.invoke('save-project', projectData, filename),
  loadProject: (defaultPath) => ipcRenderer.invoke('load-project', defaultPath),
  writeProjectFile: (filePath, projectData) => ipcRenderer.invoke('write-project-file', filePath, projectData)
}); 