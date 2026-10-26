$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$project = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -LiteralPath (Join-Path $project 'package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected release version.' }
$release = Join-Path $project 'release'
$application = Join-Path $release 'win-unpacked'
if (-not (Test-Path -LiteralPath (Join-Path $application 'SignalStrip.exe'))) { throw 'Build the Windows executable first.' }
if (Test-Path -LiteralPath (Join-Path $application 'SignalStripData')) { throw 'Private runtime data exists in the build folder. Package a clean build.' }
$archive = Join-Path $release "SignalStrip-$version-Windows-x64.zip"
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
$zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem -LiteralPath $application -File -Recurse | ForEach-Object {
        $entryName = $_.FullName.Substring($application.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [IO.Compression.CompressionLevel]::Fastest) | Out-Null
    }
} finally { $zip.Dispose() }
Write-Output "Portable Windows ZIP created: $archive"
