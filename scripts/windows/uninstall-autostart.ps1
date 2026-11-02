# Güneş'i Windows açılışından ve masaüstünden kaldırır, çalışan sunucuyu durdurur.
$ErrorActionPreference = 'SilentlyContinue'
foreach ($dir in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Desktop'))) {
  $p = Join-Path $dir 'Güneş.lnk'
  if (Test-Path $p) { Remove-Item $p; Write-Host "  ✓ Kaldırıldı: $p" -ForegroundColor Green }
}
& (Join-Path $PSScriptRoot 'stop-gunes.ps1')
