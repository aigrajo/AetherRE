#!/bin/bash
# Ghidra Headless Analyzer Script for Unix-like systems
# Usage: ./run_ghidra_headless.sh <path_to_ghidra> <project_dir> <project_name> <binary_file>

if [ "$#" -lt 4 ]; then
    echo "Usage: $0 <path_to_ghidra> <project_dir> <project_name> <binary_file>"
    exit 1
fi

GHIDRA_PATH=$1
PROJECT_DIR=$2
PROJECT_NAME=$3
BINARY_FILE=$4
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
EXTRACTOR_SCRIPT="${SCRIPT_DIR}/ghidra_extract.py"

echo "[+] Starting Ghidra headless analysis..."
echo "[+] Ghidra path: $GHIDRA_PATH"
echo "[+] Project directory: $PROJECT_DIR"
echo "[+] Project name: $PROJECT_NAME"
echo "[+] Binary file: $BINARY_FILE"
echo "[+] Extraction script: $EXTRACTOR_SCRIPT"

# Run Ghidra headless analyzer
"${GHIDRA_PATH}/support/analyzeHeadless" "$PROJECT_DIR" "$PROJECT_NAME" -import "$BINARY_FILE" -postScript "$EXTRACTOR_SCRIPT" -deleteProject -noanalysis

echo "[+] Analysis complete. Check the data directory for results." 