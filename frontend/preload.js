const { contextBridge, ipcRenderer } = require('electron');

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
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Chat API] Server error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Chat API] Received response:', result);
      return result;
    } catch (error) {
      console.error('[Chat API] Network error:', error);
      throw error; // Re-throw to be handled by the renderer
    }
  },
}); 