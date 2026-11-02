# Çalışan Güneş sunucusunu durdurur.
$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'server[\\/]dist[\\/]index\.js' }
if (-not $procs) { Write-Host 'Güneş çalışmıyor.'; return }
$procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "  ✓ Durduruldu (PID $($_.ProcessId))" -ForegroundColor Green }
