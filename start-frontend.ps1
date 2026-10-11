param([switch]$Dev, [switch]$Lan)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
# VS Code may have inherited PATH before Node was installed.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $nodeDirectory = Join-Path $env:ProgramFiles "nodejs"
    if (Test-Path (Join-Path $nodeDirectory "node.exe")) { $env:Path = "$nodeDirectory;$env:Path" }
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "Install Node.js and restart VS Code." }
if (-not (Test-Path "frontend/node_modules/next")) { throw "Run npm.cmd ci --prefix frontend first." }
# Shell values override a stale cloud URL in .env.local.
$env:NEXT_PUBLIC_API_BASE_URL = "/api"
$listenAddress = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
if ($Dev) {
    & npm.cmd --prefix frontend run dev -- --hostname $listenAddress
} else {
    # Rebuild so the client bundle contains the local /api setting.
    & npm.cmd --prefix frontend run build -- --webpack
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed; server was not started." }
    & npm.cmd --prefix frontend run start -- --hostname $listenAddress
}
exit $LASTEXITCODE
