@echo off
setlocal enabledelayedexpansion

SET PROJECT_ROOT=%~dp0
SET CONFIG_FILE=%PROJECT_ROOT%config.json
SET TEMP_DIR=%PROJECT_ROOT%temp
SET DATA_DIR=%PROJECT_ROOT%data

echo =============================================
echo AetherRE - Ghidra Reverse Engineering Tool
echo =============================================

:: Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Python is not installed or not in PATH
    exit /b 1
)

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed or not in PATH
    exit /b 1
)

:: Check if config.json exists, if not run setup
IF NOT EXIST "%CONFIG_FILE%" (
    echo [*] First-time setup: Setting up Ghidra...
    
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

:: Check for the command line argument (binary file)
IF "%1"=="" (
    echo [*] No binary file specified. Starting GUI only...
) ELSE (
    :: Verify file exists
    IF NOT EXIST "%1" (
        echo [!] Error: Binary file not found: %1
        pause
        exit /b 1
    )
    
    :: Run headless analysis
    echo [*] Running analysis on: %1
    echo [*] This may take a while depending on the size of the binary...
    
    :: Create a project name from the binary name
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

:: Setup Python environment
if not exist venv (
    echo [*] Creating Python virtual environment...
    python -m venv venv
    call venv\Scripts\activate
    echo [*] Installing Python dependencies...
    pip install -r requirements.txt
) else (
    echo [*] Using existing Python virtual environment...
    call venv\Scripts\activate
)

:: Start the FastAPI server in a new window
echo [*] Starting backend server...
start "AetherRE Backend" cmd /c "venv\Scripts\python backend\main.py --server"

:: Wait a moment for the server to start
timeout /t 2 /nobreak >nul

:: Check if frontend dependencies are installed
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

:: Start the GUI
echo [*] Starting AetherRE GUI...
cd "%PROJECT_ROOT%frontend"
start cmd /c "npm start"

:: Cleanup on exit
echo [*] Press Ctrl+C to exit and clean up processes...
:WAIT
timeout /t 1 /nobreak >nul
tasklist /FI "WINDOWTITLE eq AetherRE Backend" | find "AetherRE Backend" >nul
if %ERRORLEVEL% equ 0 goto WAIT

:: Cleanup
taskkill /F /FI "WINDOWTITLE eq AetherRE Backend" >nul 2>nul
endlocal 