# whisper-cli'yi calistirir; sure (gercek zamana orani) ve tepe RAM olcer.
# Ornek: kos.ps1 -Wav toplanti.wav -Model ggml-medium.bin -Ad tur1 -Ekstra '--vad','-vm','C:\...\ggml-silero-v6.2.0.bin'
# Cikti: <CiktiKlasoru>\<Ad>.vtt  ve  <Ad>.olcum.json
param(
  [Parameter(Mandatory)][string]$Wav,
  [Parameter(Mandatory)][string]$Ad,
  [string]$Model = 'ggml-medium.bin',
  [string[]]$Ekstra = @(),
  [int]$Thread = 8,
  [double]$Pencere = 0,   # yalnizca ilk N sn isleniyorsa (hiz hesabi icin) N'i verin

  [string]$Klasor = "$env:USERPROFILE\Downloads\whisper-cpp",
  [string]$Cikti = "$PSScriptRoot\sonuc"
)
$cli = Get-ChildItem $Klasor -Recurse -Filter whisper-cli.exe | Select-Object -First 1
New-Item -ItemType Directory -Force $Cikti | Out-Null
$onek = Join-Path $Cikti $Ad
$args = @('-m', (Join-Path $Klasor $Model), '-f', $Wav, '-l', 'tr', '-t', $Thread, '-ovtt', '-of', $onek) + $Ekstra
$sw = [Diagnostics.Stopwatch]::StartNew()
$log = "$onek.log"
$p = Start-Process -FilePath $cli.FullName -ArgumentList $args -PassThru -NoNewWindow -RedirectStandardError $log -RedirectStandardOutput "$onek.stdout"
$tepe = 0
while (-not $p.HasExited) {
  try { $p.Refresh(); if ($p.PeakWorkingSet64 -gt $tepe) { $tepe = $p.PeakWorkingSet64 } } catch {}
  Start-Sleep -Milliseconds 1000
}
$sw.Stop()
$sureSn = [math]::Round($sw.Elapsed.TotalSeconds, 1)
$sesSn = if ($Pencere -gt 0) { $Pencere } else { [math]::Round((Get-Item $Wav).Length / 32000, 1) }
[pscustomobject]@{
  ad = $Ad; model = $Model; ekstra = ($Ekstra -join ' '); thread = $Thread
  sure_sn = $sureSn; ses_sn = $sesSn; hiz_x = [math]::Round($sesSn / $sureSn, 2)
  tepe_ram_mb = [math]::Round($tepe / 1MB); cikis = $p.ExitCode
} | ConvertTo-Json | Set-Content -Encoding UTF8 "$onek.olcum.json"
Get-Content "$onek.olcum.json"
