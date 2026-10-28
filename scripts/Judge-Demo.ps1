$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$env:SIGNALSTRIP_DATA_DIR = Join-Path $project 'local\judge-demo'
New-Item -ItemType Directory -Path $env:SIGNALSTRIP_DATA_DIR -Force | Out-Null
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Push-Location $project
try { npm start; if ($LASTEXITCODE -ne 0) { throw 'SignalStrip did not start.' } } finally { Pop-Location }
