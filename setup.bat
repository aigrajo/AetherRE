@echo off
setlocal enabledelayedexpansion

SET PROJECT_ROOT=%~dp0
SET CONFIG_FILE=%PROJECT_ROOT%config.json
SET TEMP_DIR=%PROJECT_ROOT%temp
SET DATA_DIR=%PROJECT_ROOT%data

echo =============================================
echo AetherRE - Setup Script
echo =============================================

:: Check Python installation and version
echo [*] Checking Python installation...
python --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [!] Error: Python is not installed or not in PATH
    echo [*] Please install Python 3.8 or newer from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Verify Python version
for /f "tokens=2" %%I in ('python --version 2^>^&1') do set PYTHON_VERSION=%%I
for /f "tokens=1 delims=." %%I in ("!PYTHON_VERSION!") do set PYTHON_MAJOR=%%I
for /f "tokens=2 delims=." %%I in ("!PYTHON_VERSION!") do set PYTHON_MINOR=%%I

if !PYTHON_MAJOR! LSS 3 (
    echo [!] Error: Python 3.8 or newer is required
    echo [*] Current version: !PYTHON_VERSION!
    pause
    exit /b 1
)
if !PYTHON_MAJOR! EQU 3 if !PYTHON_MINOR! LSS 8 (
    echo [!] Error: Python 3.8 or newer is required
    echo [*] Current version: !PYTHON_VERSION!
    pause
    exit /b 1
)

:: Check Node.js installation and version
echo [*] Checking Node.js installation...
node --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [!] Error: Node.js is not installed or not in PATH
    echo [*] Please install Node.js 16 or newer from https://nodejs.org/
    pause
    exit /b 1
)

:: Verify Node.js version
for /f "tokens=1" %%I in ('node --version') do set NODE_VERSION=%%I
for /f "tokens=1 delims=." %%I in ("!NODE_VERSION!") do set NODE_MAJOR=%%I
if !NODE_MAJOR! LSS 16 (
    echo [!] Error: Node.js 16 or newer is required
    echo [*] Current version: !NODE_VERSION!
    pause
    exit /b 1
)

:: Check Ghidra installation
echo [*] Checking Ghidra installation...

:: Check if config.json exists and is valid
if exist "%CONFIG_FILE%" (
    echo [*] Found existing config.json...
    
    :: Check if Ghidra path exists
    for /f "tokens=*" %%a in ('powershell -Command "(Get-Content '%CONFIG_FILE%' | ConvertFrom-Json).ghidra_path"') do set GHIDRA_PATH=%%a
    if exist "!GHIDRA_PATH!" (
        echo [*] Using existing Ghidra installation at: !GHIDRA_PATH!
    ) else (
        echo [!] Ghidra path in config.json is invalid
        echo [*] Running Ghidra setup...
        goto :setup_ghidra
    )
) else (
    :setup_ghidra
    echo [*] Setting up Ghidra...
    
    :: Use PowerShell to run the setup script
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& {$ErrorActionPreference='Stop'; & '%PROJECT_ROOT%scripts\setup_ghidra.ps1'}"
    
    IF NOT !ERRORLEVEL! == 0 (
        echo [!] Ghidra setup failed. Please check the error messages above.
        pause
        exit /b 1
    )
    
    echo [+] Ghidra setup complete!
)

:: Setup the temp directory
IF NOT EXIST "%TEMP_DIR%" (
    mkdir "%TEMP_DIR%"
)

:: Setup the data directory
IF NOT EXIST "%DATA_DIR%" (
    mkdir "%DATA_DIR%"
)

:: Install npm dependencies
echo [*] Installing npm dependencies...
call npm install
IF NOT !ERRORLEVEL! == 0 (
    echo [!] Failed to install npm dependencies
    pause
    exit /b 1
)

echo [+] Setup complete. 
echo [+] Please install Python dependencies by following the instructions in README.md
echo [+] After installing dependencies, you can run run_aetherre.bat to start the application.
pause
endlocal 