# Capture technician background FCM / JobNotif logs during Test C.
# Prereq: USB debugging enabled, adb in PATH, app package com.clicks.tech
#
# Usage (from clicks-api):
#   .\scripts\qa-tech-background-alert-logcat.ps1
#   .\scripts\qa-tech-background-alert-logcat.ps1 -DurationSec 120

param(
  [int]$DurationSec = 90
)

$ErrorActionPreference = "Stop"

Write-Host "Technician background alert — logcat capture ($DurationSec s)"
Write-Host "1. Force-stop Clicks Technician on the phone"
Write-Host "2. Assign a job OR run: node scripts/qa-tech-background-alert.js --send-live"
Write-Host "3. Watch for [JobNotif] and FirebaseMessaging lines below"
Write-Host ""

$devices = adb devices 2>&1 | Select-String "device$"
if (-not $devices) {
  Write-Error "No adb device connected. Enable USB debugging and reconnect."
}

$logFile = Join-Path $PSScriptRoot "qa-tech-background-alert-logcat.txt"
Write-Host "Writing to $logFile"
Write-Host ""

adb logcat -c
adb logcat -v time `
  flutter:V `
  JobNotif:V `
  FirebaseMessaging:V `
  flutter_local_notifications:V `
  *:S 2>&1 | Tee-Object -FilePath $logFile | Select-Object -First 5000

Write-Host "`nDone. Review $logFile for:"
Write-Host "  [JobNotif] showed insistent urgent notif ... bg=true"
Write-Host "  Firebase.initializeApp failed"
Write-Host "  (no JobNotif lines = FCM never reached background handler)"
