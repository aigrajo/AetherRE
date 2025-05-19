@echo off
setlocal enabledelayedexpansion

SET PROJECT_ROOT=%~dp0
SET CONFIG_FILE=%PROJECT_ROOT%config.json
SET TEMP_DIR=%PROJECT_ROOT%temp
SET DATA_DIR=%PROJECT_ROOT%data

echo =============================================
echo AetherRE - Ghidra Reverse Engineering Plugin
echo =============================================

:: Check if setup has been done
if not exist venv (
    echo [!] Setup has not been completed
    echo [*] Please run setup.bat first
    pause
    exit /b 1
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

:: Start the FastAPI server in a new window with activated venv
echo [*] Starting backend server...
start "AetherRE Backend" cmd /c "call %PROJECT_ROOT%venv\Scripts\activate.bat && python %PROJECT_ROOT%backend\main.py --server"

:: Wait a moment for the server to start
timeout /t 2 /nobreak >nul

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