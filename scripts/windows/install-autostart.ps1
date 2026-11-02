# Güneş'i Windows açılışına ve masaüstüne ekler.
# Çalıştırma:  powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$vbs = Join-Path $root 'scripts\windows\start-gunes.vbs'
$icon = Join-Path $root 'scripts\windows\gunes.ico'
$ws = New-Object -ComObject WScript.Shell

$targets = @(
  @{ Dir = [Environment]::GetFolderPath('Startup'); Name = 'Güneş.lnk' },
  @{ Dir = [Environment]::GetFolderPath('Desktop'); Name = 'Güneş.lnk' }
)
foreach ($t in $targets) {
  $path = Join-Path $t.Dir $t.Name
  $lnk = $ws.CreateShortcut($path)
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = "`"$vbs`""
  $lnk.WorkingDirectory = $root
  $lnk.Description = 'Güneş - kişisel asistan'
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Save()
  Write-Host "  ✓ $path" -ForegroundColor Green
}
Write-Host "`nGüneş artık her açılışta başlayacak. Hemen başlatmak için masaüstündeki 'Güneş' kısayoluna tıklayın." -ForegroundColor Yellow
