# Reads VITE_GOOGLE_MAPS_API_KEY from clicks-interface/.env (same source as web admin).
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\..\clicks-interface\.env")
)

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

$key = $null
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*VITE_GOOGLE_MAPS_API_KEY\s*=\s*(.+)\s*$') {
    $key = $matches[1].Trim().Trim('"').Trim("'")
  }
}

if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Error "VITE_GOOGLE_MAPS_API_KEY not found in $EnvFile"
  exit 1
}

Write-Output $key
