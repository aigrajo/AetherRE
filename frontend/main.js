const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;
let backendProcess = null;

// Default data directory - look in project root first, then fallback to app directory
const projectRootDir = path.join(__dirname, '..');
const defaultDataDir = fs.existsSync(path.join(projectRootDir, 'data')) 
  ? path.join(projectRootDir, 'data')
  : path.join(app.getPath('userData'), 'data');

// Function to start the backend process
function startBackendProcess() {
  if (backendProcess) {
    console.log('Using existing backend process');
    return backendProcess;
  }

  console.log('Starting new backend process...');
  const backendPath = path.join(projectRootDir, 'backend', 'main.py');
  console.log('Backend script path:', backendPath);
  
  backendProcess = spawn('python', [backendPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  console.log('Backend process started with PID:', backendProcess.pid);

  backendProcess.stdout.on('data', (data) => {
    console.log('Backend stdout:', data.toString());
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('Backend stderr:', data.toString());
  });

  backendProcess.on('close', (code) => {
    console.log('Backend process exited with code:', code);
    backendProcess = null;
  });

  return backendProcess;
}

// Function to get or start the backend process
function getBackendProcess() {
  if (!backendProcess) {
    return startBackendProcess();
  }
  return backendProcess;
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle loading JSON files
ipcMain.handle('load-json-file', async (event, defaultFolder) => {
  // Use data directory as the default location if no specific path is provided
  const startFolder = defaultFolder || defaultDataDir;
  
  // Ensure the directory exists
  if (!fs.existsSync(startFolder)) {
    try {
      fs.mkdirSync(startFolder, { recursive: true });
    } catch (err) {
      console.error('Error creating directory:', err);
    }
  }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: startFolder,
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf8');
      app.lastDirectory = path.dirname(filePath);
      // Send JSON to backend for xref computation
      const backendProcess = getBackendProcess();
      const backendResult = await new Promise((resolve, reject) => {
        let stdoutBuffer = '';
        const stdoutHandler = (data) => {
          const chunk = data.toString();
          stdoutBuffer += chunk;
          while (true) {
            const newlineIndex = stdoutBuffer.indexOf('\n');
            if (newlineIndex === -1) break;
            const message = stdoutBuffer.slice(0, newlineIndex);
            stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
            try {
              const data = JSON.parse(message);
              if (data.type === 'analysis_complete') {
                backendProcess.removeListener('data', stdoutHandler);
                resolve({
                  data: data.data,
                  path: filePath,
                  filename: path.basename(filePath)
                });
              } else if (data.type === 'error') {
                backendProcess.removeListener('data', stdoutHandler);
                reject(new Error(data.message));
              }
            } catch (e) {}
          }
        };
        backendProcess.stdout.on('data', stdoutHandler);
        const message = JSON.stringify({ type: 'analyze_json', json: fileContent });
        backendProcess.stdin.write(message + '\n');
      });
      return backendResult;
    } catch (error) {
      console.error('Error loading JSON file:', error);
      return null;
    }
  }
  
  return null;
});

// Handle getting a list of available analysis files
ipcMain.handle('get-analysis-files', async () => {
  try {
    if (!fs.existsSync(defaultDataDir)) {
      return [];
    }
    
    const files = fs.readdirSync(defaultDataDir)
      .filter(file => file.endsWith('_functions.json'))
      .map(file => ({
        name: file,
        path: path.join(defaultDataDir, file),
        date: fs.statSync(path.join(defaultDataDir, file)).mtime
      }))
      .sort((a, b) => b.date - a.date); // Most recent first
      
    return files;
  } catch (error) {
    console.error('Error reading analysis files:', error);
    return [];
  }
});

// Handle binary analysis
ipcMain.handle('analyze-binary', async (event, filePath) => {
  console.log('Received analyze-binary request for:', filePath);
  try {
    // Get the backend process
    const backendProcess = getBackendProcess();
    if (!backendProcess) {
      console.error('Failed to start backend process');
      throw new Error('Backend process not available');
    }

    console.log('Sending analysis request to backend...');
    // Send analysis request to backend
    const result = await new Promise((resolve, reject) => {
      let stdoutBuffer = '';
      
      // Set up stdout handler
      const stdoutHandler = (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        
        // Process complete JSON messages
        while (true) {
          const newlineIndex = stdoutBuffer.indexOf('\n');
          if (newlineIndex === -1) break;
          
          const message = stdoutBuffer.slice(0, newlineIndex);
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          
          try {
            const data = JSON.parse(message);
            console.log('Received message from backend:', data);
            
            if (data.type === 'progress') {
              event.sender.send('analysis-progress', data.progress);
            } else if (data.type === 'analysis_complete') {
              backendProcess.removeListener('data', stdoutHandler);
              resolve(data);
            } else if (data.type === 'error') {
              backendProcess.removeListener('data', stdoutHandler);
              reject(new Error(data.message));
            }
          } catch (e) {
            console.error('Error parsing backend message:', e);
          }
        }
      };
      
      backendProcess.stdout.on('data', stdoutHandler);
      
      // Send analysis request
      const message = JSON.stringify({
        type: 'analyze_binary',
        path: filePath
      });
      console.log('Sending message to backend:', message);
      backendProcess.stdin.write(message + '\n');
    });

    console.log('Analysis complete:', result);
    return result;
  } catch (error) {
    console.error('Error analyzing binary:', error);
    throw error;
  }
}); 