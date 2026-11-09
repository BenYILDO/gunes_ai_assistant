# Teams/Zoom/Webex... gibi arama uygulamalarinin pencerelerini izler; yeni ve kapanan pencereleri satir satir yazar.
# Gunes sunucusu bu ciktiyi data/callwatch.log dosyasina alir (arama CALARKEN hangi pencerenin acildigini ogrenmek icin).
# Hicbir sey kaydetmez, ses dinlemez; yalnizca pencere baslik ve sinif adlarini okur.
param([string]$Pattern = 'teams|zoom|webex|skype|slack')
# Turkce karakterler bozulmasin: ciktiyi UTF-8 yaz
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Pen {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static List<string> Liste(uint[] pids) {
    var r = new List<string>();
    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) >= 0 && IsWindowVisible(h)) { var t = new StringBuilder(256); var c = new StringBuilder(256); GetWindowText(h, t, 256); GetClassName(h, c, 256); r.Add(pid + "|" + c + "|" + t); }
      return true; }, IntPtr.Zero);
    return r;
  }
}
"@
$prev = @{}
$ilk = $true
while ($true) {
  $names = @{}
  $pids = @(Get-Process | Where-Object { $_.ProcessName -match $Pattern } | ForEach-Object { $names[[string]$_.Id] = $_.ProcessName; [uint32]$_.Id })
  $cur = @{}
  if ($pids.Count) { foreach ($l in [Pen]::Liste($pids)) { $cur[$l] = $true } }
  foreach ($k in $cur.Keys) {
    if (-not $prev.ContainsKey($k)) {
      $p = $k.Split('|')[0]
      [Console]::Out.WriteLine(($(if ($ilk) { 'BASE' } else { 'ADD' })) + '|' + $names[$p] + '|' + $k)
    }
  }
  foreach ($k in $prev.Keys) { if (-not $cur.ContainsKey($k)) { [Console]::Out.WriteLine('DEL|' + $k) } }
  [Console]::Out.Flush()
  $prev = $cur
  $ilk = $false
  Start-Sleep -Milliseconds 1500
}
