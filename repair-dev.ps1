param(
  [switch]$ResetDeps = $false
)

$projectRoot = "C:\Users\Jenna\OneDrive\Playground\aura-weather"
Set-Location $projectRoot

Write-Host "=== Aura Weather dev environment repair ===" -ForegroundColor Cyan

Write-Host "Step 1/5: stopping leftover Node/Vite processes..." -ForegroundColor Yellow
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcs) {
  $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 400
}

Write-Host "Step 2/5: checking port 5173 listeners..." -ForegroundColor Yellow
$listeners = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  $listeners | ForEach-Object {
    Write-Host "Stopping process $($_.OwningProcess) on 5173..."
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 400
}

Write-Host "Step 3/5: validating Node/npm versions..." -ForegroundColor Yellow
$nodeVersion = (& node -v 2>$null)
$npmVersion = (& npm -v 2>$null)
if (-not $nodeVersion -or -not $npmVersion) {
  Write-Host "Node/npm missing. Install Node LTS (>=18) and rerun." -ForegroundColor Red
  exit 1
}
Write-Host "node: $nodeVersion"
Write-Host "npm:  $npmVersion"

if ($nodeVersion -match "v(\d+)") {
  $major = [int]$Matches[1]
  if ($major -lt 18) {
    Write-Host "Your Node major version is $major; Vite tooling works best on Node 18+." -ForegroundColor Red
    exit 1
  }
}

Write-Host "Step 4/5: installing dependencies " -NoNewline
if ($ResetDeps) {
  Write-Host "(full reset requested)..."
  Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
  npm cache clean --force
  npm install
} else {
  Write-Host "..."
  npm install
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "npm install failed. If the issue is permissions, run this terminal as Administrator." -ForegroundColor Red
  exit 1
}

Write-Host "Step 5/5: starting Vite..." -ForegroundColor Yellow
Write-Host "Open http://127.0.0.1:5173/ then hard-refresh (Ctrl+Shift+R)." -ForegroundColor Green
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort false
