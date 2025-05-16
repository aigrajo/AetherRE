const { ipcRenderer } = require('electron');

// Expose protected methods for renderer process
window.api = {
  loadJsonFile: (defaultPath) => ipcRenderer.invoke('load-json-file', defaultPath),
  getAnalysisFiles: () => ipcRenderer.invoke('get-analysis-files'),
  version: require('./package.json').version
}; 