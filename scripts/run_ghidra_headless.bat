@echo off
setlocal enabledelayedexpansion

:: Default paths relative to project root
set "PROJECT_ROOT=%~dp0..\"
set "GHIDRA_HOME=%PROJECT_ROOT%tools\ghidra\ghidra_10.4_PUBLIC"
set "PROJECT_DIR=%PROJECT_ROOT%temp"
set "SCRIPT_DIR=%PROJECT_ROOT%scripts"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "OUTPUT_DIR=%PROJECT_ROOT%data"

:: Parse command line arguments
set "BINARY="
set "PROJECT_NAME=test_project"

:parse_args
if "%~1"=="" goto :end_parse_args
if /i "%~1"=="-binary" (
    set "BINARY=%~2"
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
if /i "%~1"=="-ghidra" (
    set "GHIDRA_HOME=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="-output" (
    set "OUTPUT_DIR=%~2"
    shift
    shift
    goto :parse_args
)
shift
goto :parse_args
:end_parse_args

:: Validate required parameters
if not defined BINARY (
    echo [!] Error: Binary file not specified
    echo Usage: %~nx0 -binary ^<path_to_binary^> [-project ^<project_name^>] [-ghidra ^<ghidra_path^>] [-output ^<output_dir^>]
    exit /b 1
)

:: Convert relative binary path to absolute path only if not already absolute (does not contain ':')
echo Binary before normalization: !BINARY!
echo.
echo Checking if binary path is absolute...
echo !BINARY! | findstr /C:":" >nul
if errorlevel 1 (
    set "BINARY=%PROJECT_ROOT%!BINARY!"
    echo Binary was relative, converted to: !BINARY!
) else (
    echo Binary is absolute, using as-is: !BINARY!
)
echo.

:: Verify binary exists
if not exist "!BINARY!" (
    echo [!] Error: Binary file not found: !BINARY!
    exit /b 1
)

:: Verify Ghidra installation
if not exist "%GHIDRA_HOME%\support\analyzeHeadless.bat" (
    echo [!] Error: Ghidra not found at: %GHIDRA_HOME%
    echo Please specify correct path using -ghidra parameter
    exit /b 1
)

:: Create output directory if it doesn't exist
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: Debug: Echo the command to be run
echo Command to be executed:
echo "%GHIDRA_HOME%\support\analyzeHeadless.bat" "%PROJECT_DIR%" %PROJECT_NAME% -import "!BINARY!" -overwrite -scriptPath "%BACKEND_DIR%" -postScript ghidra_extract.py -deleteProject
echo.
echo Output directory: %OUTPUT_DIR%

echo [PROGRESS] 20

:: Run headless analysis
set "GHIDRA_OUTPUT_DIR=%OUTPUT_DIR%"
"%GHIDRA_HOME%\support\analyzeHeadless.bat" "%PROJECT_DIR%" %PROJECT_NAME% -import "!BINARY!" -overwrite -scriptPath "%BACKEND_DIR%" -postScript ghidra_extract.py -deleteProject

echo [PROGRESS] 80

endlocal
