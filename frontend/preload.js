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
  }
});

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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let eventEnd;
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
          const eventStr = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);
          if (eventStr.startsWith('data: ')) {
            try {
              const dataObj = JSON.parse(eventStr.replace('data: ', '').trim());
              if (dataObj.reply) {
                fullReply += dataObj.reply;
                sessionId = dataObj.session_id;
                window.dispatchEvent(new CustomEvent('chat-chunk', { 
                  detail: dataObj.reply,
                  sessionId: dataObj.session_id
                }));
              }
            } catch (e) {
              console.error('[Chat API] Error parsing streamed chunk:', e);
            }
          }
        }
      }
      return { reply: fullReply, session_id: sessionId };
    } catch (error) {
      console.error('[Chat API] Network error:', error);
      if (error.name === 'AbortError') {
        console.error('[Chat API] Request timed out after 30 seconds');
        window.dispatchEvent(new CustomEvent('chat-chunk', { 
          detail: 'Error: Request to AI service timed out. The backend server might not be running or is taking too long to respond.' 
        }));
      }
      throw error;
    }
  },

  // New chat session APIs
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

  clearChat: async (sessionId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/chat/${sessionId}/clear`, {
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
      console.error('[Chat API] Error clearing chat:', error);
      throw error;
    }
  },

  listChatSessions: async () => {
    try {
      const response = await fetch('http://localhost:8000/api/chat/sessions', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[Chat API] Error listing chat sessions:', error);
      throw error;
    }
  }
}); 