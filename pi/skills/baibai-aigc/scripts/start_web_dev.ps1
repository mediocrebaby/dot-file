param(
    [switch]$SkipInstall,
    [string]$Workspace = $env:BAIBAI_WORKSPACE_ROOT
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
if (-not $Workspace) {
    $Workspace = (Get-Location).Path
    if ($Workspace -eq $rootDir -or $Workspace.StartsWith($rootDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Pass -Workspace <existing user project directory>; data must not default to the skill installation."
    }
}
$workspaceDir = (Resolve-Path -LiteralPath $Workspace).Path
if (-not (Test-Path -LiteralPath $workspaceDir -PathType Container)) { throw "Workspace must be a directory." }
$env:BAIBAI_WORKSPACE_ROOT = $workspaceDir
# Escape PowerShell string literals used in the child shell commands.
$quotedWorkspace = $workspaceDir.Replace("'", "''")
$quotedRoot = $rootDir.Replace("'", "''")
$appDir = Join-Path $rootDir "app"
$venvDir = Join-Path $rootDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$venvActivate = Join-Path $venvDir "Scripts\Activate.ps1"

function Test-PythonCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Venv {
    if (Test-Path -LiteralPath $venvPython) {
        return
    }

    Write-Host "Creating virtual environment in .venv ..."
    if (Test-PythonCommand -Name "py") {
        & py -3 -m venv $venvDir
        return
    }

    if (Test-PythonCommand -Name "python") {
        & python -m venv $venvDir
        return
    }

    throw "Python 3 was not found. Install Python 3 first, then rerun this script."
}

function Install-BackendDependencies {
    Write-Host "Installing backend dependencies ..."
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r (Join-Path $rootDir "requirements.txt")
}

function Install-FrontendDependencies {
    Write-Host "Installing frontend dependencies ..."
    Push-Location -LiteralPath $appDir
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}

function Start-ServiceWindow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-EncodedCommand",
        $encodedCommand
    ) -WorkingDirectory $rootDir | Out-Null
    Write-Host "$Title started."
}

if (-not $SkipInstall) {
    Ensure-Venv
    Install-BackendDependencies
    Install-FrontendDependencies
}
elseif (-not (Test-Path -LiteralPath $venvPython)) {
    throw "No existing virtual environment. Run without -SkipInstall only after approving dependency installation."
}

$quotedPython = $venvPython.Replace("'", "''")
$quotedApp = $appDir.Replace("'", "''")
$quotedActivate = $venvActivate.Replace("'", "''")
$backendCommand = @"
Set-Location -LiteralPath '$quotedWorkspace'
Write-Host 'Starting backend on http://127.0.0.1:8765'
& '$quotedPython' '$quotedRoot/scripts/web_app.py'
"@

$frontendCommand = @"
Set-Location -LiteralPath '$quotedApp'
if (Test-Path -LiteralPath '$quotedActivate') {
    Write-Host 'Using the skill virtual environment'
}
Write-Host 'Starting frontend on http://127.0.0.1:1420'
npm run dev:web
"@

Start-ServiceWindow -Title "Backend" -Command $backendCommand
Start-ServiceWindow -Title "Frontend" -Command $frontendCommand

Write-Host ""
Write-Host "Web backend:  http://127.0.0.1:8765"
Write-Host "Web frontend: http://127.0.0.1:1420"
Write-Host ""
Write-Host "If dependencies are already installed, run:"
Write-Host "Pass -Workspace <your-data-directory> -SkipInstall to reuse existing dependencies."
