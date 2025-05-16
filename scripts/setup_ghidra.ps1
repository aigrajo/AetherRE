# AetherRE - Ghidra Setup Script for Windows
# This script downloads and sets up Ghidra in a portable way
param (
    [string]$GhidraVersion = "10.4",
    [string]$SetupDir = "..\tools"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speeds up downloads

# Create directories
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptPath).Parent.FullName
$ToolsDirectory = Join-Path $ProjectRoot "tools"
$GhidraDirectory = Join-Path $ToolsDirectory "ghidra"
$DownloadsDirectory = Join-Path $ToolsDirectory "downloads"

# Create necessary directories
if (-not (Test-Path $ToolsDirectory)) {
    New-Item -ItemType Directory -Path $ToolsDirectory | Out-Null
}
if (-not (Test-Path $DownloadsDirectory)) {
    New-Item -ItemType Directory -Path $DownloadsDirectory | Out-Null
}
if (-not (Test-Path $GhidraDirectory)) {
    New-Item -ItemType Directory -Path $GhidraDirectory | Out-Null
}

# Check for existing Ghidra installation
$GhidraPattern = Join-Path $GhidraDirectory "ghidra_${GhidraVersion}_PUBLIC*"
$ExistingGhidra = Get-ChildItem -Path $GhidraPattern -Directory -ErrorAction SilentlyContinue | Select-Object -First 1

if ($ExistingGhidra) {
    Write-Host "[+] Ghidra $GhidraVersion is already installed at: $($ExistingGhidra.FullName)"
    $GhidraInstallDir = $ExistingGhidra.FullName
} else {
    # Download Ghidra
    Write-Host "[+] Downloading Ghidra $GhidraVersion..."
    
    # Get the download link directly from Ghidra's website
    try {
        # For newer versions, hardcode known download URLs based on version
        if ($GhidraVersion -eq "10.4") {
            $GhidraZipFile = "ghidra_10.4_PUBLIC_20230928.zip"
            $GhidraDownloadUrl = "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_10.4_build/ghidra_10.4_PUBLIC_20230928.zip"
        }
        elseif ($GhidraVersion -eq "10.3.3") {
            $GhidraZipFile = "ghidra_10.3.3_PUBLIC_20230829.zip"
            $GhidraDownloadUrl = "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_10.3.3_build/ghidra_10.3.3_PUBLIC_20230829.zip"
        }
        elseif ($GhidraVersion -eq "10.3.2") {
            $GhidraZipFile = "ghidra_10.3.2_PUBLIC_20230711.zip"
            $GhidraDownloadUrl = "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_10.3.2_build/ghidra_10.3.2_PUBLIC_20230711.zip"
        }
        elseif ($GhidraVersion -eq "10.3.1") {
            $GhidraZipFile = "ghidra_10.3.1_PUBLIC_20230614.zip"
            $GhidraDownloadUrl = "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_10.3.1_build/ghidra_10.3.1_PUBLIC_20230614.zip"
        }
        elseif ($GhidraVersion -eq "10.3") {
            $GhidraZipFile = "ghidra_10.3_PUBLIC_20230510.zip"
            $GhidraDownloadUrl = "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_10.3_build/ghidra_10.3_PUBLIC_20230510.zip"
        }
        else {
            # Fallback to trying to scrape the GitHub page
            Write-Host "[+] Looking up the exact download URL for Ghidra $GhidraVersion..."
            $Response = Invoke-WebRequest -Uri "https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_${GhidraVersion}_build" -UseBasicParsing
            $Content = $Response.Content
            
            $Pattern = "ghidra_${GhidraVersion}_PUBLIC_\d{8}\.zip"
            if ($Content -match $Pattern) {
                $GhidraZipFile = $matches[0]
                $GhidraDownloadUrl = "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GhidraVersion}_build/$GhidraZipFile"
                Write-Host "[+] Found download URL: $GhidraDownloadUrl"
            } else {
                Write-Host "[!] Error: Could not determine the exact download URL."
                Write-Host "[!] Please download Ghidra manually from: https://github.com/NationalSecurityAgency/ghidra/releases"
                Write-Host "[!] Extract it to: $GhidraDirectory"
                exit 1
            }
        }
    } catch {
        Write-Host "[!] Error accessing GitHub: $_"
        Write-Host "[!] Please download Ghidra manually from: https://github.com/NationalSecurityAgency/ghidra/releases"
        Write-Host "[!] Extract it to: $GhidraDirectory"
        exit 1
    }
    
    $ZipPath = Join-Path $DownloadsDirectory $GhidraZipFile
    
    # Download the zip file
    try {
        Write-Host "[+] Downloading from: $GhidraDownloadUrl"
        Invoke-WebRequest -Uri $GhidraDownloadUrl -OutFile $ZipPath -UseBasicParsing
        Write-Host "[+] Download complete."
    } catch {
        Write-Host "[!] Error downloading Ghidra: $_"
        exit 1
    }
    
    # Extract Ghidra
    Write-Host "[+] Extracting Ghidra..."
    try {
        Expand-Archive -Path $ZipPath -DestinationPath $GhidraDirectory -Force
        Write-Host "[+] Extraction complete."
    } catch {
        Write-Host "[!] Error extracting Ghidra: $_"
        exit 1
    }
    
    # Optional: Remove the downloaded zip to save space
    Remove-Item $ZipPath -Force
    Write-Host "[+] Cleaned up downloaded archive."
    
    # Get the actual Ghidra installation directory
    $GhidraInstallDir = (Get-ChildItem -Path $GhidraDirectory -Directory | Where-Object { $_.Name -like "ghidra_${GhidraVersion}_PUBLIC*" } | Select-Object -First 1).FullName
    
    if (-not $GhidraInstallDir) {
        Write-Host "[!] Error: Could not find the Ghidra installation directory after extraction."
        exit 1
    }
}

# Create a configuration file for the project to locate Ghidra
$ConfigFile = Join-Path $ProjectRoot "config.json"
$ConfigObject = @{
    "ghidra_path" = $GhidraInstallDir
    "ghidra_version" = $GhidraVersion
    "last_setup" = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
}

$ConfigObject | ConvertTo-Json | Set-Content -Path $ConfigFile
Write-Host "[+] Created configuration file at: $ConfigFile"

# Verify Java installation (required by Ghidra)
try {
    $JavaVersion = (java -version 2>&1 | Out-String)
    if ($JavaVersion -match "version") {
        Write-Host "[+] Java is installed: $($Matches[0])"
    } else {
        Write-Host "[!] Java not detected but is required for Ghidra. Please install JDK 11 or newer."
    }
} catch {
    Write-Host "[!] Java not detected but is required for Ghidra. Please install JDK 11 or newer."
}

Write-Host "`n[+] Ghidra setup complete!"
Write-Host "[+] Ghidra installation path: $GhidraInstallDir"
Write-Host "[+] To run a headless analysis, use:"
Write-Host "    scripts\run_ghidra_headless.bat <project_dir> <project_name> <binary_file>" 