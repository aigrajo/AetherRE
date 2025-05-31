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

#### **Core Analysis Engine**
- **Ghidra Integration**: Automated binary analysis using Ghidra's headless mode
- **Multi-format Support**: Analyze PE executables, DLLs, ELF binaries, and raw binaries
- **Function Extraction**: Automatic function discovery, decompilation, and metadata extraction
- **Real-time Processing**: Stream analysis results as they become available

#### **AI-Powered Assistant**
- **Intelligent Analysis**: OpenAI-powered reverse engineering assistant with specialized tools
- **Context-Aware Chat**: AI maintains current function context and binary state
- **Smart Tool Selection**: Automatically chooses appropriate analysis tools based on user queries
- **11 Specialized AI Tools**:
  - `get_pseudocode` - Retrieve decompiled code for current function
  - `get_assembly` - Get assembly instructions with operand details
  - `get_variables` - Extract local variables and their types
  - `get_xrefs` - Analyze cross-references (incoming/outgoing calls)
  - `get_strings` - Find strings and constants in current function
  - `search_functions` - Search functions by name across entire binary
  - `jump_to_function` - Navigate between functions by name or address
  - `get_imports` - Analyze imported libraries and external functions
  - `search_binary` - Search for patterns, strings, or constants globally
  - `analyze_address` - Get detailed information about specific memory addresses
  - `get_constants` - Extract numeric constants and magic numbers

#### **Project Management**
- **Session Persistence**: Maintain analysis state across application restarts
- **Project Organization**: Group related binaries and analysis sessions
- **Export Capabilities**: Save analysis results in structured JSON format
- **File History**: Track recently analyzed files and quick reload

#### **Annotation System**
- **Function Renaming**: Rename functions with validation and conflict detection
- **Variable Management**: Rename and organize local variables
- **Notes Integration**: Add notes to functions and analysis sessions
- **Tagging System**: Organize functions with custom tags and categories

#### **Cross-Reference Analysis**
- **Incoming Calls**: Track which functions call the current function
- **Outgoing Calls**: Analyze functions called by current function
- **Address Resolution**: Resolve function names and addresses automatically
- **Context Information**: Show call context and instruction offsets

### License

[MIT License](https://opensource.org/licenses/MIT)

### Acknowledgments

- [Ghidra](https://github.com/NationalSecurityAgency/ghidra) - Reverse engineering framework
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [FastAPI](https://fastapi.tiangolo.com/) - Backend API framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor component
- [OpenAI](https://openai.com/) - AI-powered analysis capabilities
- [D3.js](https://d3js.org/) - Control flow graph visualization
- [Python](https://www.python.org/) - Backend programming language
- [Node.js](https://nodejs.org/) - JavaScript runtime for frontend development
