# Konusmaci ayrimi (sherpa-onnx) calistirir; sure ve tepe RAM olcer.
# Ornek: ayrim.ps1 -Wav toplanti.wav -Embedding 3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx -Ad ayrim-campplus -Kume 3
# Kume = konusmaci sayisi biliniyorsa; 0 ise -Esik ile otomatik (kume esigi, kucuk = daha cok konusmaci).
param(
  [Parameter(Mandatory)][string]$Wav,
  [Parameter(Mandatory)][string]$Embedding,
  [Parameter(Mandatory)][string]$Ad,
  [int]$Kume = 3,
  [double]$Esik = 0.5,
  [int]$Thread = 8,
  [string]$Segmentasyon = '',   # bos: pyannote-segmentation-3-0; reverb-diarization icin onnx yolu verin
  [string]$Klasor = "$env:USERPROFILE\Downloads\whisper-cpp",
  [string]$Cikti = "$PSScriptRoot\sonuc"
)
$exe = (Get-ChildItem $Klasor -Recurse -Filter 'sherpa-onnx-offline-speaker-diarization.exe' | Select-Object -First 1).FullName
$seg = (Get-ChildItem $Klasor -Recurse -Filter 'model.onnx' | Where-Object { $_.FullName -match 'pyannote-segmentation' } | Select-Object -First 1).FullName
if ($Segmentasyon) { $seg = $Segmentasyon }
New-Item -ItemType Directory -Force $Cikti | Out-Null
$kumeArg = if ($Kume -gt 0) { "--clustering.num-clusters=$Kume" } else { "--clustering.cluster-threshold=$Esik" }
$argl = @($kumeArg, "--segmentation.pyannote-model=$seg", "--embedding.model=$(Join-Path $Klasor $Embedding)", "--segmentation.num-threads=$Thread", "--embedding.num-threads=$Thread", $Wav)
$cikt = Join-Path $Cikti "$Ad.txt"
$sw = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $exe -ArgumentList $argl -PassThru -NoNewWindow -RedirectStandardOutput $cikt -RedirectStandardError "$cikt.log"
$tepe = 0
while (-not $p.HasExited) { try { $p.Refresh(); if ($p.PeakWorkingSet64 -gt $tepe) { $tepe = $p.PeakWorkingSet64 } } catch {}; Start-Sleep -Milliseconds 500 }
$sw.Stop()
$ses = [math]::Round((Get-Item $Wav).Length / 32000, 1)
[pscustomobject]@{ ad = $Ad; embedding = $Embedding; kume = $Kume; sure_sn = [math]::Round($sw.Elapsed.TotalSeconds, 1); ses_sn = $ses; hiz_x = [math]::Round($ses / $sw.Elapsed.TotalSeconds, 2); tepe_ram_mb = [math]::Round($tepe / 1MB) } | ConvertTo-Json | Set-Content -Encoding UTF8 "$cikt.olcum.json"
Get-Content "$cikt.olcum.json"
