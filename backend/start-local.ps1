$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$python = if (Test-Path ".venv-local/Scripts/python.exe") {
    Join-Path $PSScriptRoot ".venv-local/Scripts/python.exe"
} else { Join-Path $PSScriptRoot ".venv/Scripts/python.exe" }
if (-not (Test-Path $python)) { throw "Create a Python virtual environment first; see backend/README.md." }
$env:LENNY_DEVICE = "cpu"
& $python -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
exit $LASTEXITCODE
