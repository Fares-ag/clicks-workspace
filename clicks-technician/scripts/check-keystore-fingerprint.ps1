# Print SHA1 fingerprint for a keystore — compare with Play Console expected fingerprint.
param(
    [Parameter(Mandatory = $true)]
    [string]$KeystorePath,
    [string]$StorePassword = "",
    [string]$KeyAlias = ""
)

$ErrorActionPreference = "Stop"
$keytool = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
if (-not (Test-Path $keytool)) { throw "keytool not found at $keytool" }
if (-not (Test-Path $KeystorePath)) { throw "Keystore not found: $KeystorePath" }

$expectedPlay = "FB:DA:3F:2B:93:60:C0:B7:89:69:40:B0:34:D0:49:46:0F:E6:3F:55"

if (-not $StorePassword) {
    $secure = Read-Host "Keystore password" -AsSecureString
    $StorePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}

Write-Host "Keystore: $KeystorePath"
Write-Host ""
Write-Host "Expected by Play Store (Sanad Technician upload key):"
Write-Host "  SHA1: $expectedPlay"
Write-Host ""

$args = @("-list", "-v", "-keystore", $KeystorePath, "-storepass", $StorePassword)
if ($KeyAlias) { $args += @("-alias", $KeyAlias) }

& $keytool @args 2>&1 | Select-String "Alias name:|SHA1:|SHA256:"

Write-Host ""
Write-Host "If SHA1 matches $expectedPlay, use this keystore in android/key.properties"
