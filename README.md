# AetherRE

A modern reverse engineering plugin built on Ghidra with an Electron GUI and AI-powered analysis capabilities.

---

## Quick Start

### Prerequisites

The setup script will automatically check for and verify these requirements:

- [Node.js](https://nodejs.org/) (v16+ for the Electron GUI)
- [Java 11+](https://adoptium.net/) (for Ghidra)
- [Python 3.8+](https://www.python.org/) (for backend scripts)
- Windows 10/11 (Linux support coming soon)

### Setup

1. **Clone the repository:**
   ```sh
   git clone https://github.com/aigrajo/AetherRE.git
   cd AetherRE
   ```

2. **Run the setup script:**
   ```sh
   setup.bat
   ```
   This script will automatically:
   - Check and verify all required dependencies
   - Set up Ghidra (if not already installed)
   - Create and configure Python virtual environment
   - Install all Python dependencies
   - Install frontend dependencies
   - Create necessary directories

3. **Start the application:**
   ```sh
   run_aetherre.bat
   ```
   This will:
   - Start the FastAPI backend server
   - Launch the Electron GUI
   - Set up the AI assistant

   To analyze a binary file:
   ```sh
   run_aetherre.bat path\to\binary.exe
   ```

### Project Structure

```
AetherRE/
├── frontend/           # Electron GUI application
│   ├── index.html     # Main application window
│   ├── styles.css     # Application styles
│   ├── renderer.js    # Main renderer process
│   ├── resize.js      # Panel resizing functionality
│   └── package.json   # Frontend dependencies
├── backend/           # Python backend
│   ├── main.py       # FastAPI server
│   └── chat.py       # AI chat functionality
├── scripts/           # Automation scripts
│   ├── setup_ghidra.ps1    # Ghidra setup script
│   └── run_ghidra_headless.bat  # Headless analysis
├── data/              # Extracted function data (JSON)
├── tools/             # Downloaded tools (Ghidra)
├── temp/              # Temporary Ghidra project files
├── venv/              # Python virtual environment
├── requirements.txt   # Python dependencies
├── setup.bat         # Initial setup script
├── run_aetherre.bat  # Application launcher
└── config.json       # Project configuration
```

### Using the Application

1. **Using the GUI:**
   - Click "Load File" to upload a binary (`.exe`, `.dll`, `.bin`) or JSON file
   - The app will analyze the binary using Ghidra in the background
   - Once complete, functions and details are displayed in the GUI
   - Use the AI Assistant panel for intelligent analysis

### Troubleshooting


#### Manual Setup (if automatic setup fails)

If the automatic setup fails, you can:

1. **Set up Python environment manually:**
   ```sh
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Set up frontend manually:**
   ```sh
   cd frontend
   npm install
   cd ..
   ```

3. **Set up Ghidra manually:**
   - Download from [GitHub Releases](https://github.com/NationalSecurityAgency/ghidra/releases)
   - Extract to a directory of your choice
   - Create `config.json`:
     ```json
     {
       "ghidra_path": "C:/path/to/extracted/ghidra_X.Y_PUBLIC_YYYYMMDD",
       "ghidra_version": "X.Y"
     }
     ```

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
