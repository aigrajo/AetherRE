const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
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

// Create the application menu
function createMenu() {
  console.log('Creating application menu...');
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Load Binary...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            console.log('Load Binary menu clicked');
            mainWindow.webContents.send('menu-action', 'load-file');
          }
        },
        { type: 'separator' },
        {
          label: 'Save Project...',
          accelerator: 'CmdOrCtrl+S',
          enabled: false,
          id: 'save-project',
          click: () => {
            console.log('Save Project menu clicked');
            mainWindow.webContents.send('menu-action', 'save-project');
          }
        },
        {
          label: 'Save Project As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: false,
          id: 'save-project-as',
          click: () => {
            console.log('Save Project As menu clicked');
            mainWindow.webContents.send('menu-action', 'save-project-as');
          }
        },
        {
          label: 'Load Project...',
          accelerator: 'CmdOrCtrl+Shift+O',
          enabled: false,
          id: 'load-project',
          click: () => {
            console.log('Load Project menu clicked');
            mainWindow.webContents.send('menu-action', 'load-project');
          }
        },
        { type: 'separator' },
        {
          role: 'quit'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AetherRE',
          click: () => {
            console.log('About menu clicked');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About AetherRE',
              message: 'AetherRE',
              detail: 'A modern reverse engineering plugin built on Ghidra with an Electron GUI and AI-powered analysis capabilities.'
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  console.log('Application menu set successfully');
  
  return menu;
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Load the index.html file first
  mainWindow.loadFile('index.html');

  // Create and set the application menu after window is ready
  mainWindow.webContents.once('dom-ready', () => {
    console.log('DOM ready, creating menu...');
    createMenu();
  });

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle enabling/disabling project menu items
ipcMain.handle('enable-project-menu', (event, enabled) => {
  const menu = Menu.getApplicationMenu();
  if (menu) {
    const saveItem = menu.getMenuItemById('save-project');
    const saveAsItem = menu.getMenuItemById('save-project-as');
    const loadItem = menu.getMenuItemById('load-project');
    if (saveItem) saveItem.enabled = enabled;
    if (saveAsItem) saveAsItem.enabled = enabled;
    if (loadItem) loadItem.enabled = enabled;
  }
});

// Create window when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // Parse command line arguments for binary loading
  const args = process.argv.slice(2);
  let binaryPath = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--binary=')) {
      binaryPath = args[i].substring('--binary='.length).replace(/^"(.*)"$/, '$1');
      break;
    }
  }
  
  // If binary path is specified, send it to the renderer after DOM is ready
  if (binaryPath && fs.existsSync(binaryPath)) {
    console.log('Auto-loading binary for analysis:', binaryPath);
    mainWindow.webContents.once('dom-ready', () => {
      // Wait a bit for the renderer to be fully ready
      setTimeout(() => {
        mainWindow.webContents.send('auto-analyze-binary', binaryPath);
      }, 1000);
    });
  }

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

// Handle calculating file hash
ipcMain.handle('calculate-file-hash', async (event, filePath) => {
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    
    const fileBuffer = fs.readFileSync(filePath);
    hash.update(fileBuffer);
    
    return hash.digest('hex');
  } catch (error) {
    console.error('Error calculating file hash:', error);
    throw error;
  }
});

// Handle saving project files
ipcMain.handle('save-project', async (event, projectData, filename) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'AetherRE Project Files', extensions: ['aere'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2), 'utf8');
      console.log('Project saved to:', result.filePath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error saving project:', error);
    throw error;
  }
});

// Handle writing project files directly (for Save without dialog)
ipcMain.handle('write-project-file', async (event, filePath, projectData) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf8');
    console.log('Project written to:', filePath);
    return true;
  } catch (error) {
    console.error('Error writing project file:', error);
    throw error;
  }
});

// Handle loading project files
ipcMain.handle('load-project', async (event, defaultPath) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: defaultPath,
      properties: ['openFile'],
      filters: [
        { name: 'AetherRE Project Files', extensions: ['aere'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const projectData = JSON.parse(fileContent);
      
      // Validate project file format
      if (!projectData.aetherre_project || !projectData.target_binary) {
        throw new Error('Invalid project file format');
      }
      
      console.log('Project loaded from:', filePath);
      return projectData;
    }
    
    return null;
  } catch (error) {
    console.error('Error loading project:', error);
    throw error;
  }
});

// Handle showing binary file dialog
ipcMain.handle('show-binary-dialog', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Binary Files', extensions: ['exe', 'dll', 'so', 'dylib', 'bin'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error showing binary dialog:', error);
    throw error;
  }
});

// Handle showing project load dialog
ipcMain.handle('show-project-load-dialog', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'AetherRE Project Files', extensions: ['aere'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const projectData = JSON.parse(fileContent);
      
      // Validate project file format
      if (!projectData.aetherre_project || !projectData.target_binary) {
        throw new Error('Invalid project file format');
      }
      
      console.log('Project loaded from:', filePath);
      return {
        projectData: projectData,
        filePath: filePath
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error loading project via dialog:', error);
    throw error;
  }
});

// Handle showing project save dialog
ipcMain.handle('show-project-save-dialog', async (event, projectData, defaultFilename) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultFilename,
      filters: [
        { name: 'AetherRE Project Files', extensions: ['aere'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2), 'utf8');
      console.log('Project saved to:', result.filePath);
      return {
        success: true,
        filePath: result.filePath
      };
    }
    
    return {
      success: false,
      filePath: null
    };
  } catch (error) {
    console.error('Error saving project via dialog:', error);
    throw error;
  }
}); 