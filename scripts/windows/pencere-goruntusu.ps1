# Arama uygulamasinin (Teams/Zoom/...) EN USTTEKI penceresinin goruntusunu PNG olarak kaydeder.
# Gunes, kullanici "Katil" dedigi anda bunu calistirir; goruntu yalnizca arayanin adini okumak icin kullanilir,
# islem bitince silinir. Tum ekrani DEGIL, yalnizca o pencereyi alir.
param([string]$Pattern = 'teams|zoom|webex|skype|slack', [Parameter(Mandatory)][string]$Out, [int]$MaxWidth = 1600)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Cap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  public class W { public IntPtr H; public uint Pid; public string Title; public RECT R; }
  // Z sirasina gore (en ustten asagi) gorunur, kucultulmemis, gizlenmemis pencereler
  public static List<W> Liste(uint[] pids) {
    var r = new List<W>();
    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) < 0 || !IsWindowVisible(h) || IsIconic(h)) return true;
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4); if (cloaked != 0) return true;
      RECT rc; GetWindowRect(h, out rc); if (rc.R - rc.L < 300 || rc.B - rc.T < 200) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      r.Add(new W { H = h, Pid = pid, Title = t.ToString(), R = rc }); return true; }, IntPtr.Zero);
    return r;
  }
}
"@
[void][Cap]::SetProcessDPIAware()
$pids = @(Get-Process | Where-Object { $_.ProcessName -match $Pattern } | ForEach-Object { [uint32]$_.Id })
if (-not $pids.Count) { '{"ok":false,"hata":"arama uygulamasi calismiyor"}'; return }
$w = [Cap]::Liste($pids) | Select-Object -First 1
if (-not $w) { '{"ok":false,"hata":"gorunur arama penceresi yok (kucultulmus olabilir)"}'; return }
$width = $w.R.R - $w.R.L; $height = $w.R.B - $w.R.T
function NonBlack([System.Drawing.Bitmap]$b) {
  $n = 0; $t = 0
  for ($y = 0; $y -lt $b.Height; $y += 16) { for ($x = 0; $x -lt $b.Width; $x += 16) { $c = $b.GetPixel($x, $y); $t++; if (($c.R + $c.G + $c.B) -gt 30) { $n++ } } }
  if ($t) { $n / $t } else { 0 }
}
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc(); [void][Cap]::PrintWindow($w.H, $hdc, 2); $g.ReleaseHdc($hdc); $g.Dispose()
$method = 'printwindow'; $nb = NonBlack $bmp
if ($nb -lt 0.02) {
  # pencere cizilemedi (donanim hizlandirma): yalnizca o pencerenin ekrandaki dikdortgenini kopyala (pencere ustte degilse baska seyi gosterebilir)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($w.R.L, $w.R.T, 0, 0, $bmp.Size); $g.Dispose()
  $method = 'ekran-dikdortgeni'; $nb = NonBlack $bmp
}
if ($width -gt $MaxWidth) { $nh = [int]($height * $MaxWidth / $width); $small = New-Object System.Drawing.Bitmap $bmp, $MaxWidth, $nh; $bmp.Dispose(); $bmp = $small }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
$o = @{ ok = ($nb -ge 0.02); pencere = $w.Title; w = $width; h = $height; doluluk = [math]::Round($nb, 3); yontem = $method }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
($o | ConvertTo-Json -Compress)
