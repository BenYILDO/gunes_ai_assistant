<#
  Güneş İstek akışını test etmek için istek dosyası bırakır ve cevabı bekler.
  OneDrive masaüstü uygulamasının şirket hesabıyla kurulu ve senkronda olması gerekir.

  Örnekler:
    powershell -ExecutionPolicy Bypass -File scripts\power-automate\istek-olustur.ps1 -Tur aralik -Saat 24
    powershell -ExecutionPolicy Bypass -File scripts\power-automate\istek-olustur.ps1 -Tur aralik -Saat 72 -Teams
    powershell -ExecutionPolicy Bypass -File scripts\power-automate\istek-olustur.ps1 -Tur ara -Kelime "mutabakat"
    powershell -ExecutionPolicy Bypass -File scripts\power-automate\istek-olustur.ps1 -Tur taslak -Kime "ben@sirket.com" -Konu "Test" -Metin "Gönderilmemeli"
#>
param(
  [ValidateSet('aralik', 'ara', 'taslak')] [string]$Tur = 'aralik',
  [int]$Saat = 24,
  [switch]$Teams,
  [string]$Kelime = '',
  [string]$Kime = '',
  [string]$Konu = 'Güneş taslak testi',
  [string]$Metin = 'Bu bir test taslağıdır. Gönderilmemeli.',
  [int]$BekleDakika = 10
)
$ErrorActionPreference = 'Stop'

$od = $env:OneDriveCommercial
if (-not $od) { $od = $env:OneDrive }
if (-not $od -or -not (Test-Path $od)) { throw 'OneDrive klasörü bulunamadı. OneDrive masaüstü uygulamasında şirket hesabıyla oturum açın.' }

$kok = Join-Path $od 'Gunes'
foreach ($k in 'istek', 'cevap', 'islenen') { New-Item -ItemType Directory -Force -Path (Join-Path $kok $k) | Out-Null }

$simdi = (Get-Date).ToUniversalTime()
$id = 'test-' + $Tur + '-' + $simdi.ToString('yyyyMMdd-HHmmss')
$iso = { param($d) $d.ToString("yyyy-MM-ddTHH:mm:ssZ") }

switch ($Tur) {
  'aralik' {
    $istek = [ordered]@{
      id = $id; tur = 'aralik'
      bas = & $iso $simdi.AddHours(-$Saat); bit = & $iso $simdi
      takvimBas = & $iso $simdi.Date.AddDays(-1); takvimBit = & $iso $simdi.Date.AddDays(3)
      teams = [bool]$Teams
    }
  }
  'ara' {
    if (-not $Kelime) { throw '-Kelime gerekli.' }
    $istek = [ordered]@{ id = $id; tur = 'ara'; kelime = $Kelime }
  }
  'taslak' {
    if (-not $Kime) { throw '-Kime gerekli (kendi adresinizi yazın).' }
    $istek = [ordered]@{ id = $id; tur = 'taslak'; cevapla = ''; kime = @($Kime); konu = $Konu; metin = $Metin }
  }
}

# Power Automate JSON'u BOM'suz UTF-8 bekler
$json = $istek | ConvertTo-Json -Depth 5 -Compress
$istekYolu = Join-Path $kok "istek\$id.json"
[System.IO.File]::WriteAllText($istekYolu, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "İstek bırakıldı: $istekYolu"
Write-Host "Cevap bekleniyor (en fazla $BekleDakika dk)..."

$cevapYolu = Join-Path $kok "cevap\$id.json"
$baslangic = Get-Date
while (-not (Test-Path $cevapYolu)) {
  if (((Get-Date) - $baslangic).TotalMinutes -gt $BekleDakika) {
    Write-Warning 'Cevap gelmedi. Power Automate çalışma geçmişine ve OneDrive senkron durumuna bakın.'
    exit 1
  }
  Start-Sleep -Seconds 10
}
$sure = [int]((Get-Date) - $baslangic).TotalSeconds
Start-Sleep -Seconds 2
$cevap = Get-Content -Raw -Encoding UTF8 $cevapYolu | ConvertFrom-Json
Write-Host ""
Write-Host "Cevap geldi ($sure sn): $cevapYolu"
Write-Host ("Durum   : " + $cevap.durum)
if ($cevap.durum -ne 'tamam') { Write-Host ("Hata    : " + ($cevap.hata | ConvertTo-Json -Depth 3 -Compress)) ; exit 1 }
Write-Host ("Mail    : " + @($cevap.mailler).Count)
Write-Host ("Toplantı: " + @($cevap.takvim).Count)
Write-Host ("Teams   : " + @($cevap.teams).Count + " sohbet")
if ($cevap.mailDevam) { Write-Host 'Not: Aralıkta 200 maili aşan kayıt var; sonraki sayfa için "devam" isteği gerekir.' }
if ($cevap.taslak) { Write-Host ("Taslak  : " + $cevap.taslak.webLink) }
