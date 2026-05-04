$ErrorActionPreference = "Stop"

$wd = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $wd

function Test-PortBusy([int]$Port) {
  return [bool](netstat -ano | Select-String -Pattern "[:\]]$Port\s+.*LISTENING")
}

if (Test-PortBusy 5000) {
  Write-Host "Port 5000 is already in use. Stop the existing process before running this script."
  exit 1
}

if (Test-PortBusy 5173) {
  Write-Host "Port 5173 is already in use. Stop the existing process before running this script."
  exit 1
}

Write-Host "Installing dependencies..."
npm.cmd install
if ($LASTEXITCODE -ne 0) {
  Write-Host "Dependency installation failed."
  exit $LASTEXITCODE
}

$backendLog = Join-Path $wd "backend-run.log"
$frontendLog = Join-Path $wd "frontend-run.log"

Write-Host "Starting backend and frontend in background..."
$backendCmd = "npm.cmd run dev --workspace backend > `"$backendLog`" 2>&1"
$frontendCmd = "npm.cmd run dev --workspace frontend -- --port 5173 > `"$frontendLog`" 2>&1"

$backendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $backendCmd" -WorkingDirectory $wd -WindowStyle Hidden -PassThru
$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $frontendCmd" -WorkingDirectory $wd -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 4

function Wait-ForEndpoint([string]$Url, [bool]$Allow401 = $false, [int]$Attempts = 10, [int]$DelaySeconds = 1) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing $Url
      return "OK $($r.StatusCode)"
    } catch {
      if ($Allow401 -and $_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
        return "OK 401 (expected before Salesforce login)"
      }
      if ($i -eq ($Attempts - 1)) {
        return "FAIL: $($_.Exception.Message)"
      }
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

$frontendStatus = Wait-ForEndpoint -Url "http://localhost:5173"
$backendStatus = Wait-ForEndpoint -Url "http://localhost:5000/me" -Allow401 $true

Write-Host "Frontend $frontendStatus"
Write-Host "Backend $backendStatus"

Write-Host "Backend PID: $($backendProc.Id)"
Write-Host "Frontend PID: $($frontendProc.Id)"
Write-Host "Logs: $backendLog and $frontendLog"
