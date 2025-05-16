# AetherRE

A modern reverse engineering tool built on Ghidra with an Electron GUI.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/): Required for the Electron GUI
- [Java 11+](https://adoptium.net/): Required for Ghidra
- Windows 10/11 (Linux support coming soon)

### One-Click Setup and Use

1. Clone or download this repository
2. Run `run_aethere.bat [optional_binary_file_path]`
   - On first run, this will automatically download and set up Ghidra
   - If you provide a binary file path, it will analyze the binary before starting the GUI
   - Otherwise, it will just start the GUI where you can load previously analyzed binaries

```bash
# To just start the GUI:
run_aethere.bat

# To analyze a binary and start the GUI:
run_aethere.bat C:\path\to\your\binary.exe
```

## Project Structure

```
AetherRE/
├── frontend/           # Electron GUI application
│   ├── src/           # Source code
│   ├── public/        # Static assets
│   └── package.json   # Node.js dependencies
├── scripts/           # Python and batch scripts
│   ├── setup_ghidra.ps1
│   └── run_ghidra_headless.bat
├── data/             # Extracted function data (JSON)
├── tools/            # Downloaded tools (Ghidra)
├── temp/             # Temporary Ghidra project files
└── config.json       # Project configuration
```

## Development Setup

### 1. Set up Ghidra

```powershell
# Download and set up Ghidra automatically
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {& '.\scripts\setup_ghidra.ps1'}"
```

### 2. Frontend Development

```bash
# Install dependencies
cd frontend
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### 3. Analyze a Binary File

```bash
# Run Ghidra headless analyzer 
scripts\run_ghidra_headless.bat temp my_project C:\path\to\binary.exe
```

## Features

- Extract function pseudocode, names, and addresses from binaries
- Extract cross-references, variables, and string references
- Structure extracted data into JSON files
- Display extracted data in a modern Electron GUI
- Support for multiple binary formats
- Cross-reference visualization
- Function call graph generation
- String and data reference analysis

## Advanced Usage

### Custom Ghidra Version

You can specify a different Ghidra version when setting up:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {& '.\scripts\setup_ghidra.ps1' -GhidraVersion '10.3'}"
```

Supported versions: 10.3, 10.3.1, 10.3.2, 10.3.3, 10.4

### Using an Existing Ghidra Installation

You can provide the path to an existing Ghidra installation:

```bash
scripts\run_ghidra_headless.bat "C:\path\to\ghidra" "temp" "my_project" "C:\path\to\binary.exe"
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write clear commit messages
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PRs

## Troubleshooting

### PowerShell Execution Policy

If you encounter errors related to PowerShell execution policy, try running:

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser
```

### Java Not Found

Ghidra requires Java 11 or newer. If you get Java-related errors:
1. Download and install Java from [Adoptium](https://adoptium.net/)
2. Ensure java.exe is in your PATH
3. Restart your command prompt

### npm Commands Not Working

If npm commands fail:
1. Ensure Node.js is installed properly
2. Verify it's in your PATH by running `node --version` in a command prompt
3. Try running the commands from an administrator command prompt

### Can't Download Ghidra

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Ghidra](https://github.com/NationalSecurityAgency/ghidra) - The reverse engineering framework
- [Electron](https://www.electronjs.org/) - The framework for building cross-platform desktop apps
- [React](https://reactjs.org/) - The JavaScript library for building user interfaces
