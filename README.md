# AetherRE

A modern reverse engineering plugin built on Ghidra with an Electron GUI and AI-powered analysis capabilities.

---

### Prerequisites

The setup script will automatically check for and verify these requirements:

- [Node.js](https://nodejs.org/) (v16+ for the Electron GUI)
- [Java 11+](https://adoptium.net/) (for Ghidra)
- [Python 3.8+](https://www.python.org/) (for backend scripts)
- Windows 10/11 (Linux support eventually)

### Setup

1. **Clone the repository:**
   ```sh
   git clone https://github.com/aigrajo/AetherRE.git
   cd AetherRE
   ```

2. **Run the setup script to install prerequisites:**
   ```sh
   setup.bat
   ```
   This script will automatically:
   - Check and verify all required dependencies
   - Set up Ghidra (if not already installed)
   - Create necessary directories (temp, data)
   - Install all npm dependencies in the root directory

3. **Set up Python environment:**
   ```sh
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. **Create a .env file with your OpenAI API key:**
   ```sh
   echo OPENAI_API_KEY=your_api_key_here > .env
   ```
   Replace `your_api_key_here` with your actual OpenAI API key.

5. **Start the application:**
   ```sh
   run_aetherre.bat
   ```
   This will:
   - Start the FastAPI backend server
   - Launch the Electron GUI
   - Set up the AI assistant

   To analyze a binary file through the command line:
   ```sh
   run_aetherre.bat path\to\binary.exe
   ```

### Project Structure

```
AetherRE/
├── frontend/                    # Electron GUI application
│   ├── index.html              # Main application window
│   ├── main.js                 # Electron main process
│   ├── preload.js              # Preload script for renderer
│   ├── renderer.js             # Main renderer entry point
│   ├── resize.js               # Panel resizing functionality
│   ├── package.json            # Frontend dependencies
│   ├── renderer/               # Modular renderer components
│   │   ├── apiService.js       # API communication service
│   │   ├── chat.js             # AI chat interface
│   │   ├── cfgVisualizer.js    # Control flow graph visualization
│   │   ├── core.js             # Core renderer functionality
│   │   ├── editor.js           # Code editor integration
│   │   ├── fileHandler.js      # File upload and processing
│   │   ├── functionManager.js  # Function management
│   │   ├── functionRenamer.js  # Function renaming interface
│   │   ├── historyManager.js   # Action history management
│   │   ├── modal.js            # Modal dialog management
│   │   ├── NoteEditor.js       # Note editing interface
│   │   ├── projectManager.js   # Project management
│   │   ├── renderer.js         # Main renderer logic
│   │   ├── tabManager.js       # Tab management system
│   │   ├── TagNotePanel.js     # Tag and note panel
│   │   ├── TagsPanel.js        # Tags management panel
│   │   ├── uiUtils.js          # UI utility functions
│   │   ├── variableManager.js  # Variable management
│   │   └── xrefs.js            # Cross-references handling
│   ├── styles/                 # CSS stylesheets
│   │   ├── animations.css      # Animation styles
│   │   ├── app.css             # Main application styles
│   │   ├── assembly.css        # Assembly view styles
│   │   ├── base.css            # Base styles
│   │   ├── cfg.css             # Control flow graph styles
│   │   ├── chat.css            # Chat interface styles
│   │   ├── content.css         # Content area styles
│   │   ├── editor.css          # Code editor styles
│   │   ├── function-list.css   # Function list styles
│   │   ├── index.css           # Main index styles
│   │   ├── layout.css          # Layout and grid styles
│   │   ├── modal.css           # Modal dialog styles
│   │   ├── tagnote.css         # Tag and note styles
│   │   └── xref.css            # Cross-reference styles
│   └── assets/                 # Static assets
│       └── icon.txt            # Application icon reference
├── backend/                    # Python FastAPI backend
│   ├── __init__.py             # Package initialization
│   ├── main.py                 # FastAPI server entry point
│   ├── ghidra_extract.py       # Ghidra integration and extraction
│   ├── api/                    # API layer
│   │   ├── routes/             # API route handlers
│   │   │   ├── chat.py         # Chat/AI endpoints
│   │   │   ├── files.py        # File handling endpoints
│   │   │   ├── functions.py    # Function analysis endpoints
│   │   │   ├── history.py      # History management endpoints
│   │   │   ├── notes.py        # Notes management endpoints
│   │   │   ├── projects.py     # Project management endpoints
│   │   │   ├── tags.py         # Tags management endpoints
│   │   │   ├── validation.py   # Validation endpoints
│   │   │   └── xrefs.py        # Cross-reference endpoints
│   │   └── models/             # Data models
│   │       └── chat.py         # Chat data models
│   ├── services/               # Business logic services
│   │   ├── ai_tools_service.py         # AI tools integration
│   │   ├── chat.py                     # AI chat service
│   │   ├── file_service.py             # File processing service
│   │   ├── function_context.py         # Function context service
│   │   ├── function_rename_service.py  # Function renaming service
│   │   ├── history_service.py          # History management service
│   │   ├── note_integration_service.py # Note integration service
│   │   ├── notes_service.py            # Notes management service
│   │   ├── project_service.py          # Project management service
│   │   ├── session_manager.py          # Session management
│   │   ├── tag_service.py              # Tags management service
│   │   ├── validation_service.py       # Validation service
│   │   └── variable_rename_service.py  # Variable renaming service
│   ├── config/                 # Configuration
│   │   ├── rate_limits.py      # API rate limiting configuration
│   │   └── settings.py         # Application settings
│   ├── utils/                  # Utility functions
│   │   ├── cfg_layout.py       # Control flow graph layout utilities
│   │   └── helpers.py          # General helper functions
│   ├── data/                   # Backend data storage
│   └── notes/                  # Notes storage
├── scripts/                    # Automation and setup scripts
│   ├── run_ghidra_headless.bat # Windows Ghidra headless runner
│   ├── run_ghidra_headless.sh  # Linux Ghidra headless runner
│   └── setup_ghidra.ps1        # PowerShell Ghidra setup script
├── tools/                      # External tools
│   ├── downloads/              # Downloaded tool archives
│   └── ghidra/                 # Ghidra installation
├── tests/                      # Test files and binaries
│   ├── sky.c                   # Test C source file
│   ├── sky                     # Compiled test binary
│   ├── test_binary.c           # Test binary source
│   └── test_binary.exe         # Test Windows executable
├── data/                       # Extracted function data (JSON)
├── temp/                       # Temporary Ghidra project files
├── notes/                      # Project notes storage
├── venv/                       # Python virtual environment
├── node_modules/               # Node.js dependencies
├── requirements.txt            # Python dependencies
├── package.json                # Root Node.js configuration
├── setup.bat                   # Initial setup script
├── run_aetherre.bat           # Application launcher
├── config.json                 # Project configuration
└── .gitignore                  # Git ignore rules
```

### Using the Application

1. **Using the GUI:**
   - Click "Load File" to upload a binary (`.exe`, `.dll`, `.bin`) or JSON file
   - The app will analyze the binary using Ghidra in the background
   - Once complete, functions and details are displayed in the GUI
   - Use the AI Assistant panel for intelligent analysis

### Troubleshooting

If you encounter issues during setup:

1. **Check for Python version compatibility:**
   ```sh
   python --version
   ```
   Ensure you're using Python 3.8 or higher.

2. **Verify Node.js installation:**
   ```sh
   node --version
   ```
   Ensure you're using Node.js 16 or higher.

3. **Manual Ghidra setup:**
   - Download from [GitHub Releases](https://github.com/NationalSecurityAgency/ghidra/releases)
   - Extract to a directory of your choice
   - Create `config.json`:
     ```json
     {
       "ghidra_path": "C:/path/to/extracted/ghidra_X.Y_PUBLIC_YYYYMMDD",
       "ghidra_version": "X.Y"
     }
     ```

4. **If Python dependency installation fails:**
   - Try installing problematic packages individually
   - Check for any special requirements for your platform

### Features

- Modern Electron-based GUI 
- AI-powered analysis assistant
- Real-time binary analysis with Ghidra
- Cross-references
- String and data reference analysis
- Variable and type analysis
- Assembly and pseudocode views

### Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

### License

MIT License

### Acknowledgments

- [Ghidra](https://github.com/NationalSecurityAgency/ghidra) - Reverse engineering framework
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [FastAPI](https://fastapi.tiangolo.com/) - Backend API framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor component
