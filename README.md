# AetherRE

A modern reverse engineering tool built on Ghidra with an Electron GUI.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (for the Electron GUI)
- [Java 11+](https://adoptium.net/) (for Ghidra)
- Windows 10/11 (Linux support coming soon)
- Python 3 (for backend scripts)

---

### Setup

1. **Clone or download this repository**
2. **Install Node.js dependencies for the frontend:**
   ```sh
   cd frontend
   npm install
   ```
3. **(First time only) Download and set up Ghidra:**
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -Command "& {& '.\scripts\setup_ghidra.ps1'}"
   ```
   This will download Ghidra and set up the required directories.

---

### Running the App

1. **Start the app:**
   ```sh
   npm run start
   ```
   or run the batch file:
   ```sh
   run_aethere.bat
   ```

2. **Using the GUI:**
   - Click "Load File" to upload a binary (`.exe`, `.dll`, `.bin`) or a previously generated JSON file.
   - If you upload a binary, the app will analyze it using Ghidra and show a real-time progress bar.
   - Once analysis is complete, functions and their details will be displayed in the GUI.

---

### How It Works

- When you upload a binary, the app runs Ghidra headless analysis in the background.
- Progress is shown in real time as functions are analyzed.
- When finished, the extracted function data is displayed in the Electron GUI.
- You can also load a previously analyzed JSON file.

---

### Project Structure

```
AetherRE/
├── frontend/           # Electron GUI application
├── scripts/            # Batch and Python scripts for Ghidra automation
├── data/               # Extracted function data (JSON)
├── tools/              # Downloaded tools (Ghidra)
├── temp/               # Temporary Ghidra project files
└── config.json         # Project configuration
```

---

### Troubleshooting

- **Progress bar not updating:**  
  Ensure you have Python 3 installed and that your Ghidra scripts are up to date.
- **Java not found:**  
  Make sure Java 11+ is installed and in your PATH.
- **Ghidra not found:**  
  Run the setup script or manually extract Ghidra to `tools/ghidra`.

#### PowerShell Execution Policy
If you encounter errors related to PowerShell execution policy, try running:
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser
```

#### Java Not Found
Ghidra requires Java 11 or newer. If you get Java-related errors:
1. Download and install Java from [Adoptium](https://adoptium.net/)
2. Ensure java.exe is in your PATH
3. Restart your command prompt

#### npm Commands Not Working
If npm commands fail:
1. Ensure Node.js is installed properly
2. Verify it's in your PATH by running `node --version` in a command prompt
3. Try running the commands from an administrator command prompt

#### Can't Download Ghidra
If the automatic download fails:
1. Download Ghidra manually from [GitHub Releases](https://github.com/NationalSecurityAgency/ghidra/releases)
2. Extract it to the `tools/ghidra` directory in the project
3. Create a `config.json` file in the project root with:
   ```json
   {
     "ghidra_path": "C:/path/to/extracted/ghidra_X.Y_PUBLIC_YYYYMMDD",
     "ghidra_version": "X.Y"
   }
   ```

---

### Advanced

- You can run the Ghidra headless analysis manually:
  ```sh
  scripts\run_ghidra_headless.bat -binary C:\path\to\your\binary.exe
  ```
- The output JSON will be placed in the `data/` directory.

---

## Features

- Extract function pseudocode, names, and addresses from binaries
- Extract cross-references, variables, and string references
- Structure extracted data into JSON files
- Display extracted data in a modern Electron GUI
- Support for multiple binary formats
- Cross-reference visualization
- Function call graph generation
- String and data reference analysis

---

## License

MIT License

---

## Acknowledgments

- [Ghidra](https://github.com/NationalSecurityAgency/ghidra) - The reverse engineering framework
- [Electron](https://www.electronjs.org/) - The framework for building cross-platform desktop apps
- [React](https://reactjs.org/) - The JavaScript library for building user interfaces
