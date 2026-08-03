# Point to your existing Play Store credentials (same upload key used for the first release).
param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceAccountJson,
    [Parameter(Mandatory = $true)]
    [string]$KeystorePath,
    [Parameter(Mandatory = $true)]
    [string]$StorePassword,
    [Parameter(Mandatory = $true)]
    [string]$KeyPassword,
    [string]$KeyAlias = "upload"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path $ServiceAccountJson)) { throw "Service account not found: $ServiceAccountJson" }
if (-not (Test-Path $KeystorePath)) { throw "Keystore not found: $KeystorePath" }

$destCreds = Join-Path $root "play-store\service-account.json"
$destKeystore = Join-Path $root "android\upload-keystore.jks"
$destProps = Join-Path $root "android\key.properties"

New-Item -ItemType Directory -Force -Path (Split-Path $destCreds) | Out-Null
Copy-Item $ServiceAccountJson $destCreds -Force
Copy-Item $KeystorePath $destKeystore -Force

@"
storePassword=$StorePassword
keyPassword=$KeyPassword
keyAlias=$KeyAlias
storeFile=upload-keystore.jks
"@ | Set-Content $destProps -Encoding UTF8

Write-Host "Credentials installed."
Write-Host "  $destCreds"
Write-Host "  $destKeystore"
Write-Host "  $destProps"
Write-Host ""
Write-Host "Publish with:"
Write-Host "  .\scripts\publish-play-store.ps1 -Track production"
