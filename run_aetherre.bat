@echo off
REM AetherRE - Main Launcher Script
REM This script runs the complete AetherRE workflow

setlocal EnableDelayedExpansion

SET PROJECT_ROOT=%~dp0
SET CONFIG_FILE=%PROJECT_ROOT%config.json
SET TEMP_DIR=%PROJECT_ROOT%temp
SET DATA_DIR=%PROJECT_ROOT%data

echo =============================================
echo AetherRE - Ghidra Reverse Engineering Tool
echo =============================================

REM Check if Java is installed
java -version >nul 2>&1
IF NOT !ERRORLEVEL! == 0 (
    echo [!] Error: Java is required but not found.
    echo [!] Please install Java 11 or newer: https://adoptium.net/
    pause
    exit /b 1
)

REM Check if config.json exists, if not run setup
IF NOT EXIST "%CONFIG_FILE%" (
    echo [*] First-time setup: Setting up Ghidra...
    
    REM Use PowerShell to run the setup script
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& {$ErrorActionPreference='Stop'; & '%PROJECT_ROOT%scripts\setup_ghidra.ps1'}"
    
    IF NOT !ERRORLEVEL! == 0 (
        echo [!] Ghidra setup failed. Please check the error messages above.
        pause
        exit /b 1
    )
    
    echo [+] Ghidra setup complete!
)

REM Setup the temp directory
IF NOT EXIST "%TEMP_DIR%" (
    mkdir "%TEMP_DIR%"
)

REM Setup the data directory
IF NOT EXIST "%DATA_DIR%" (
    mkdir "%DATA_DIR%"
)

REM Check for the command line argument (binary file)
IF "%1"=="" (
    echo [*] No binary file specified. Starting GUI only...
) ELSE (
    REM Verify file exists
    IF NOT EXIST "%1" (
        echo [!] Error: Binary file not found: %1
        pause
        exit /b 1
    )
    
    REM Run headless analysis
    echo [*] Running analysis on: %1
    echo [*] This may take a while depending on the size of the binary...
    
    REM Create a project name from the binary name
    for %%I in ("%1") do (
        SET BINARY_NAME=%%~nI
    )
    
    call "%PROJECT_ROOT%scripts\run_ghidra_headless.bat" "%TEMP_DIR%" "!BINARY_NAME!" "%1"
    
    IF NOT !ERRORLEVEL! == 0 (
        echo [!] Analysis failed. Please check the error messages above.
        echo [*] Starting GUI anyway...
    ) ELSE (
        echo [+] Analysis complete! Results saved to data directory.
    )
)

REM Check if npm is available
where npm >nul 2>nul
IF NOT !ERRORLEVEL! == 0 (
    echo [!] Error: npm not found. Please install Node.js: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if frontend dependencies are installed
IF NOT EXIST "%PROJECT_ROOT%frontend\node_modules" (
    echo [*] Installing frontend dependencies...
    cd "%PROJECT_ROOT%frontend"
    call npm install
    IF NOT !ERRORLEVEL! == 0 (
        echo [!] Failed to install dependencies. Please try again or install manually.
        cd "%PROJECT_ROOT%"
        pause
        exit /b 1
    )
    cd "%PROJECT_ROOT%"
)

REM Start the GUI
echo [*] Starting AetherRE GUI...
cd "%PROJECT_ROOT%frontend"
start cmd /c "npm start"

exit /b 0 