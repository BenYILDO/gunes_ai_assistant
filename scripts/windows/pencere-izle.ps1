# Gunes: Teams/Zoom/... pencerelerini izler; yeni ve kapanan pencereleri satir satir yazar. Gunes sunucusu bunu iki is icin kullanir:
#   1) CALAN ARAMAYI yakalamak: Teams bir arama geldiginde basligi "Microsoft Teams" olan kucuk bir bildirim penceresi acar.
#   2) data/callwatch.log gunlugu (hangi pencere ne zaman acildi; ayarlamak icin).
# Satir bicimi:  KIND|surec|pid|hwnd|GxY|sinif|baslik   (KIND: BASE ilk gorulenler, ADD yeni, DEL kapanan)
#                TXT|hwnd|base64(JSON dizi)           (yeni kucuk Teams penceresindeki gorunen metinler: arama bildirimi mi anlamak icin)
# Hicbir sey kaydetmez, ses dinlemez; yalnizca pencere basligi, boyutu ve gorunen kisa metinleri okur.
param([string]$Pattern = 'teams|zoom|webex|skype|slack', [int]$IntervalMs = 500)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Pen {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static List<string> Liste(uint[] pids) {
    var r = new List<string>();
    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) >= 0 && IsWindowVisible(h)) {
        var t = new StringBuilder(256); var c = new StringBuilder(256); GetWindowText(h, t, 256); GetClassName(h, c, 256);
        RECT rc; GetWindowRect(h, out rc);
        r.Add(pid + "|" + h.ToInt64().ToString("X") + "|" + (rc.R - rc.L) + "x" + (rc.B - rc.T) + "|" + c + "|" + t);
      }
      return true; }, IntPtr.Zero);
    return r;
  }
}
"@
[void][Pen]::SetProcessDPIAware()

function Metinler([string]$hex) {
  $names = New-Object System.Collections.ArrayList
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr][Convert]::ToInt64($hex, 16))
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $all) {
      $n = $e.Current.Name
      if ($n -and $n.Length -le 90 -and -not $names.Contains($n)) { [void]$names.Add($n) }
      if ($names.Count -ge 40) { break }
    }
  } catch { }
  return ,$names
}

$prev = @{}      # anahtar -> surec adi
$ilk = $true
while ($true) {
  $pn = @{}
  $pids = @(Get-Process | Where-Object { $_.ProcessName -match $Pattern } | ForEach-Object { $pn[[string]$_.Id] = $_.ProcessName; [uint32]$_.Id })
  $cur = @{}
  if ($pids.Count) { foreach ($l in [Pen]::Liste($pids)) { $cur[$l] = $pn[$l.Split('|')[0]] } }
  foreach ($k in @($cur.Keys)) {
    if (-not $prev.ContainsKey($k)) {
      $p = $k.Split([char[]]'|', 5)
      [Console]::Out.WriteLine(($(if ($ilk) { 'BASE' } else { 'ADD' })) + '|' + $cur[$k] + '|' + $k)
      # Yeni kucuk bir Teams penceresi (bildirim olabilir): gorunen metinleri oku (agac hemen dolmayabilir, birkac kez dene)
      $wh = $p[2].Split('x')
      if (-not $ilk -and $cur[$k] -match 'teams' -and [int]$wh[0] -le 620 -and [int]$wh[1] -le 260) {
        $txt = $null
        for ($i = 0; $i -lt 4; $i++) { $txt = Metinler $p[1]; if ($txt.Count -ge 3) { break }; Start-Sleep -Milliseconds 300 }
        $json = ConvertTo-Json -Compress -InputObject @($txt)
        [Console]::Out.WriteLine('TXT|' + $p[1] + '|' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
      }
    }
  }
  foreach ($k in @($prev.Keys)) { if (-not $cur.ContainsKey($k)) { [Console]::Out.WriteLine('DEL|' + $prev[$k] + '|' + $k) } }
  [Console]::Out.Flush()
  $prev = $cur
  $ilk = $false
  Start-Sleep -Milliseconds $IntervalMs
}
