# Gunes - yerel transkript icin tum dosyalari indirir ve dogrular.
# Calistirma:  powershell -ExecutionPolicy Bypass -File scripts\whisper\indir-hepsi.ps1
# Hedef klasor: %USERPROFILE%\whisper-cpp   (ayri bir yere indirmek icin -Hedef verin)
# Her dosyanin SHA-256 (ya da boyut) kontrolu yapilir. "ENGELLENDI" = web filtresi (Forcepoint) engel sayfasi dondurdu.
param([string]$Hedef = "$env:USERPROFILE\whisper-cpp")

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest cok daha hizli calisir
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force $Hedef | Out-Null

# Ad | Url | SHA256 (bos = yok) | Beklenen boyut (bayt, 0 = bilinmiyor) | Sert (1 = hash tutmazsa hata, 0 = sadece uyari)
$gh = 'https://github.com'
$hf = 'https://huggingface.co'
$dosyalar = @(
  # --- Transkript programi ve ses araci ---
  @('whisper-bin-x64.zip',  "$gh/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip", '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb', 8928640, 1),
  @('ffmpeg-n9.0-latest-win64-gpl-9.0.zip', "$gh/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-gpl-9.0.zip", '3eff9930f1aaca49810a7bb008ac2fcb841f24b60839a847e256f54efaa7fb7a', 0, 0),  # surum "latest" yuvarlanir, hash degisebilir -> sadece uyari
  # --- Whisper modelleri (Hugging Face) ---
  @('ggml-small.bin',   "$hf/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",   '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b', 0, 1),
  @('ggml-medium.bin',  "$hf/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",  '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208', 0, 1),
  @('ggml-large-v3-turbo-q5_0.bin', "$hf/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin", '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2', 0, 1),
  @('ggml-silero-v5.1.2.bin', "$hf/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin", '29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf', 885098, 1),
  @('ggml-silero-v6.2.0.bin', "$hf/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin", '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987', 885098, 1),
  # --- Konusmaci ayrimi (sherpa-onnx) ---
  @('sherpa-onnx-v2.0.1-win-x64-shared-MD-Release.tar.bz2', "$gh/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-v2.0.1-win-x64-shared-MD-Release.tar.bz2", 'ce987d5bfca42c74b54f7b3bbaaa8c1febe3c5cd0fea8f94be80ea30e72f1f61', 0, 1),
  @('sherpa-onnx-pyannote-segmentation-3-0.tar.bz2', "$gh/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2", '', 6958444, 1),
  @('3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx', "$gh/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx", '', 28281164, 1),
  @('3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx', "$gh/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx", '', 39593761, 1),
  @('wespeaker_en_voxceleb_resnet34_LM.onnx', "$gh/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx", '', 26530550, 1)
)

$sonuc = @()
foreach ($d in $dosyalar) {
  $ad, $url, $sha, $boyut, $sert = $d
  $yol = Join-Path $Hedef $ad
  $durum = ''

  function Kontrol($yol, $sha, $boyut, $sert) {
    if (-not (Test-Path $yol)) { return 'YOK' }
    $f = Get-Item $yol
    $bas = [System.IO.File]::ReadAllBytes($yol) | Select-Object -First 15
    if ($f.Length -lt 20000 -and ([Text.Encoding]::ASCII.GetString($bas) -match '<!DOC|<html|<HTML')) { return 'ENGELLENDI' }
    if ($boyut -gt 0 -and $f.Length -ne $boyut) { return "BOYUT ($($f.Length) bayt, beklenen $boyut)" }
    if ($sha) {
      $h = (Get-FileHash $yol -Algorithm SHA256).Hash.ToLower()
      if ($h -ne $sha) { if ($sert) { return "HASH FARKLI ($h)" } else { return "UYARI: hash farkli (surum degismis olabilir)" } }
    }
    return 'TAMAM'
  }

  $durum = Kontrol $yol $sha $boyut $sert
  if ($durum -like 'TAMAM*') { Write-Host "[atlandi, zaten var] $ad" -ForegroundColor DarkGray }
  else {
    Write-Host "[indiriliyor] $ad ..." -ForegroundColor Cyan
    try { Invoke-WebRequest -Uri $url -OutFile $yol -UseBasicParsing } catch { Write-Host "  indirme hatasi: $($_.Exception.Message)" -ForegroundColor Red }
    $durum = Kontrol $yol $sha $boyut $sert
  }
  $renk = if ($durum -like 'TAMAM*' -or $durum -like 'UYARI*') { 'Green' } else { 'Red' }
  Write-Host "  -> $durum" -ForegroundColor $renk
  $sonuc += [pscustomobject]@{ Dosya = $ad; Durum = $durum }
}

# Arsivleri ac
foreach ($a in $sonuc | ? { ($_.Durum -like 'TAMAM*' -or $_.Durum -like 'UYARI*') -and $_.Dosya -match '\.(zip|tar\.bz2)$' }) {
  $yol = Join-Path $Hedef $a.Dosya
  $ad = $a.Dosya -replace '\.(zip|tar\.bz2)$', ''
  $acilan = Join-Path $Hedef "acilmis\$ad"
  if (Test-Path $acilan) { continue }
  New-Item -ItemType Directory -Force $acilan | Out-Null
  if ($yol -like '*.zip') { Expand-Archive $yol -DestinationPath $acilan -Force } else { tar -xjf $yol -C $acilan }
}

Write-Host "`n===== OZET =====" -ForegroundColor Yellow
$sonuc | Format-Table -AutoSize
$cli = Get-ChildItem $Hedef -Recurse -Filter 'whisper-cli.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$ff = Get-ChildItem $Hedef -Recurse -Filter 'ffmpeg.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$dz = Get-ChildItem $Hedef -Recurse -Filter '*speaker-diarization*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
"whisper-cli.exe : " + $(if ($cli) { $cli.FullName } else { 'BULUNAMADI' })
"ffmpeg.exe      : " + $(if ($ff) { $ff.FullName } else { 'BULUNAMADI' })
"diarization.exe : " + $(if ($dz) { $dz.FullName } else { 'BULUNAMADI' })
$sonuc | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $Hedef 'indirme-sonucu.csv')
Write-Host "`nSonuc dosyasi: $Hedef\indirme-sonucu.csv" -ForegroundColor Yellow
