$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'scripts/generate-icon.ps1')
if ($LASTEXITCODE -ne 0) {
    throw "Icon generation failed with exit code $LASTEXITCODE."
}

# Remove only project-local generated directories. Dependencies and source files are preserved.
$generatedDirectories = @('dist', 'release', 'build', 'tmp', '.electron-builder')
foreach ($directory in $generatedDirectories) {
    $path = Join-Path $projectRoot $directory
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
    }
}

New-Item -ItemType Directory -Path (Join-Path $projectRoot 'release') -Force | Out-Null

& npm exec electron-builder -- --win nsis --publish never
if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE."
}

# Keep the deliverable directory clean: only the standalone Windows installer remains.
$releasePath = Join-Path $projectRoot 'release'
Get-ChildItem -LiteralPath $releasePath -Force | Where-Object {
    $_.Extension -ne '.exe'
} | Remove-Item -Recurse -Force

$installer = Get-ChildItem -LiteralPath $releasePath -Filter '*.exe' -File | Select-Object -First 1
if (-not $installer) {
    throw 'Build completed without producing a Windows .exe installer.'
}

Write-Host "Clean installer: $($installer.FullName)"
