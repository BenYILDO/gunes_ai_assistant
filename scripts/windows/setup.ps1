# Güneş kurulumu (bir kez çalıştırın)
# powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
Write-Host "`n☀️  Güneş kurulumu`n" -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kurup tekrar deneyin.' -ForegroundColor Red; exit 1
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "Uyarı: 'claude' komutu bulunamadı. Claude Code'u kurun: https://code.claude.com  (kurduktan sonra bir kez 'claude' yazıp claude.ai hesabınızla giriş yapın)" -ForegroundColor DarkYellow
}

Write-Host '1/4  Paketler kuruluyor…' -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host '2/4  Derleniyor…' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host "3/4  .env oluşturuldu. Supabase bilgilerini girmek için açılıyor…" -ForegroundColor Cyan
  Start-Process notepad.exe '.env' -Wait
} else { Write-Host '3/4  .env zaten var.' -ForegroundColor Cyan }

Write-Host '4/4  Kontrol ediliyor…' -ForegroundColor Cyan
npm run doctor -- --live

$ans = Read-Host "`nGüneş Windows açılışında otomatik başlasın mı? (E/h)"
if ($ans -eq '' -or $ans -match '^[eEyY]') { & (Join-Path $PSScriptRoot 'install-autostart.ps1') }
Write-Host "`nHazır. Masaüstündeki 'Güneş' kısayolu ile başlatabilirsiniz." -ForegroundColor Green
