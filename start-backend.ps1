$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "backend/start-local.ps1")
exit $LASTEXITCODE
