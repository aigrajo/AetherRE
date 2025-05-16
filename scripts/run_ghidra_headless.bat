@echo off

:: Set paths
set "GHIDRA_HOME=C:\Users\aegra\Cysec\Projects\AetherRE\tools\ghidra\ghidra_10.4_PUBLIC"
set "PROJECT_DIR=C:\Users\aegra\Cysec\Projects\AetherRE\temp"
set "SCRIPT_DIR=C:\Users\aegra\Cysec\Projects\AetherRE\scripts"
set "BINARY=C:\Users\aegra\Cysec\Projects\AetherRE\tests\test_binary.exe"
set "OUTPUT_DIR=C:\Users\aegra\Cysec\Projects\AetherRE\data"

:: Create output directory if it doesn't exist
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: Debug: Echo the command to be run
echo Command to be executed:
echo "%GHIDRA_HOME%\support\analyzeHeadless.bat" "%PROJECT_DIR%" test_project -import "%BINARY%" -overwrite -scriptPath "%SCRIPT_DIR%" -postScript ghidra_extract.py -deleteProject
echo.
echo Output directory: %OUTPUT_DIR%

:: Pause for review
pause

:: Run headless analysis
set "GHIDRA_OUTPUT_DIR=%OUTPUT_DIR%"
"%GHIDRA_HOME%\support\analyzeHeadless.bat" "%PROJECT_DIR%" test_project -import "%BINARY%" -overwrite -scriptPath "%SCRIPT_DIR%" -postScript ghidra_extract.py -deleteProject
