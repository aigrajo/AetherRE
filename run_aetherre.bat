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

:: Parse command line arguments
set "BINARY_PATH="
set "PROJECT_NAME="

:parse_args
if "%~1"=="" goto :end_parse_args
if /i "%~1"=="-binary" (
    set "BINARY_PATH=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="-project" (
    set "PROJECT_NAME=%~2"
    shift
    shift
    goto :parse_args
)
:: If it's not a flag and no binary specified yet, treat as binary path
if not defined BINARY_PATH (
    set "BINARY_PATH=%~1"
)
shift
goto :parse_args
:end_parse_args

:: Start the FastAPI server in a new window with activated venv
echo [*] Starting backend server...
start "AetherRE Backend" cmd /c "cd /d %PROJECT_ROOT% && call venv\Scripts\activate.bat && %PROJECT_ROOT%venv\Scripts\python.exe %PROJECT_ROOT%backend\main.py --server"

:: Wait a moment for the server to start
timeout /t 3 /nobreak >nul

:: Check if binary path was provided
IF defined BINARY_PATH (
    :: Verify file exists
    IF NOT EXIST "!BINARY_PATH!" (
        echo [!] Error: Binary file not found: !BINARY_PATH!
        echo Usage: %~nx0 [-binary] ^<path_to_binary^> [-project ^<project_name^>]
        pause
        exit /b 1
    )
    
    echo [*] Starting AetherRE GUI with binary: !BINARY_PATH!
    cd "%PROJECT_ROOT%"
    :: Start the GUI with the binary file as argument
    start cmd /c "npm start -- --binary=\"!BINARY_PATH!\""
) ELSE (
    echo [*] Starting AetherRE GUI...
    cd "%PROJECT_ROOT%"
    start cmd /c "npm start"
)

:: Cleanup on exit
echo [*] Press Ctrl+C to exit and clean up processes...
:WAIT
timeout /t 1 /nobreak >nul
tasklist /FI "WINDOWTITLE eq AetherRE Backend" | find "AetherRE Backend" >nul
if %ERRORLEVEL% equ 0 goto WAIT

:: Cleanup
taskkill /F /FI "WINDOWTITLE eq AetherRE Backend" >nul 2>nul
endlocal 