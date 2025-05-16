const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

// Default data directory - look in project root first, then fallback to app directory
const projectRootDir = path.join(__dirname, '..');
const defaultDataDir = fs.existsSync(path.join(projectRootDir, 'data')) 
  ? path.join(projectRootDir, 'data')
  : path.join(app.getPath('userData'), 'data');

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
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
      
      // Remember this directory for next time
      app.lastDirectory = path.dirname(filePath);
      
      return {
        data: JSON.parse(fileContent),
        path: filePath,
        filename: path.basename(filePath)
      };
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