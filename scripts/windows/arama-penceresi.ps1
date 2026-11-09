# Gunes: arama algilaninca ekranin sag altinda kucuk bir pencere gosterir ("Bu aramaya katilmami ister misiniz?").
#  - Her pencerenin USTUNDE durur ama ODAGI ALMAZ: Teams/Zoom yazmaya devam eder (WS_EX_NOACTIVATE), gorev cubugunda gorunmez.
#  - Karar stdout'a tek satir olarak yazilir: JOIN | DECLINE | TIMEOUT. Sonra pencere kapanir ve program biter.
#  - Metin -Json ile (UTF-8 base64) gelir: {title, body, note, join, decline}. Betik ASCII'dir; Turkce karakterler yalnizca Json icindedir.
# Hicbir sey kaydetmez ve hicbir yere gondermez.
param([Parameter(Mandatory)][string]$Json, [int]$TimeoutSec = 120)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;
public class GunesPop : Form {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  protected override CreateParams CreateParams {
    get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080 | 0x00000008; return cp; } // NOACTIVATE | TOOLWINDOW | TOPMOST
  }
  protected override bool ShowWithoutActivation { get { return true; } }
}
"@
[void][GunesPop]::SetProcessDPIAware()
$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Json)) | ConvertFrom-Json

$bg = [Drawing.Color]::FromArgb(18, 22, 43); $fg = [Drawing.Color]::FromArgb(232, 236, 255); $dim = [Drawing.Color]::FromArgb(154, 163, 199)
$gold = [Drawing.Color]::FromArgb(245, 185, 66); $edge = [Drawing.Color]::FromArgb(52, 60, 108)
$W = 420; $pad = 16

$f = New-Object GunesPop
$f.FormBorderStyle = 'None'; $f.BackColor = $bg; $f.TopMost = $true; $f.ShowInTaskbar = $false
$f.StartPosition = 'Manual'; $f.Width = $W; $f.Opacity = 0.98

function Etiket($text, $size, $color, $bold, $x, $y, $w) {
  $l = New-Object Windows.Forms.Label
  $l.Text = $text; $l.ForeColor = $color; $l.BackColor = $bg
  $l.Font = New-Object Drawing.Font('Segoe UI', $size, $(if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }))
  $l.AutoSize = $true; $l.MaximumSize = New-Object Drawing.Size($w, 0); $l.Location = New-Object Drawing.Point($x, $y)
  $f.Controls.Add($l); return $l
}
$tx = $pad + 48; $tw = $W - $tx - $pad
$t1 = Etiket $d.title 11.5 $fg $true $tx 14 $tw
$y = $t1.Bottom + 4
$t2 = Etiket $d.body 9.5 $dim $false $tx $y $tw
$y = $t2.Bottom + 6
$t3 = Etiket $d.note 8 ([Drawing.Color]::FromArgb(120, 130, 170)) $false $tx $y $tw
$y = [Math]::Max($t3.Bottom, 64) + 12

function Dugme($text, $x, $primary, $sonuc) {
  $b = New-Object Windows.Forms.Button
  $b.Text = $text; $b.FlatStyle = 'Flat'; $b.Cursor = 'Hand'; $b.TabStop = $false
  $b.Font = New-Object Drawing.Font('Segoe UI', 9.5, [Drawing.FontStyle]::Bold)
  $b.Size = New-Object Drawing.Size(120, 32); $b.Location = New-Object Drawing.Point($x, $y)
  if ($primary) { $b.BackColor = $gold; $b.ForeColor = [Drawing.Color]::FromArgb(26, 15, 5); $b.FlatAppearance.BorderSize = 0 }
  else { $b.BackColor = $bg; $b.ForeColor = $fg; $b.FlatAppearance.BorderColor = $edge }
  $b.Name = $sonuc
  # YANLIS TIKLAMA KORUMASI: pencere imlecin durdugu yerde acilirsa, oraya gelen bir tiklama "Katil"a dusmesin.
  # Fare tiklamasi, imlec dugmenin uzerinde HAREKET ettikten sonra sayilir (klavye/erisilebilirlik ile etkinlestirme her zaman gecerli).
  $b.Add_MouseMove({ param($s, $e) if (((Get-Date) - $global:aciliz).TotalMilliseconds -gt 600) { $global:hareket++ } })
  $b.Add_Click({
    param($s, $e)
    if ($e -is [Windows.Forms.MouseEventArgs] -and $s.Name -eq 'JOIN' -and $global:hareket -lt 3) { return }
    [Console]::Out.WriteLine($s.Name); [Console]::Out.Flush(); $f.Close()
  }.GetNewClosure())
  $f.Controls.Add($b); return $b
}
$bj = Dugme $d.join $tx $true 'JOIN'
$bd = Dugme $d.decline ($tx + 130) $false 'DECLINE'
$f.Height = $y + 32 + $pad

# Guneş simgesi (altin daire + isinlar) ve ince cerceve
$f.Add_Paint({
  param($s, $e)
  $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
  $g.DrawRectangle((New-Object Drawing.Pen($edge, 1)), 0, 0, $f.Width - 1, $f.Height - 1)
  $cx = $pad + 18; $cy = 32
  $pen = New-Object Drawing.Pen($gold, 2)
  for ($a = 0; $a -lt 360; $a += 45) { $r = $a * [Math]::PI / 180; $g.DrawLine($pen, $cx + 13 * [Math]::Cos($r), $cy + 13 * [Math]::Sin($r), $cx + 18 * [Math]::Cos($r), $cy + 18 * [Math]::Sin($r)) }
  $g.FillEllipse((New-Object Drawing.SolidBrush($gold)), $cx - 9, $cy - 9, 18, 18)
})

$wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$f.Location = New-Object Drawing.Point(($wa.Right - $f.Width - 20), ($wa.Bottom - $f.Height - 20))

$global:aciliz = Get-Date; $global:hareket = 0
$timer = New-Object Windows.Forms.Timer; $timer.Interval = [Math]::Max(5, $TimeoutSec) * 1000
$timer.Add_Tick({ [Console]::Out.WriteLine('TIMEOUT'); [Console]::Out.Flush(); $f.Close() })
$timer.Start()
[Windows.Forms.Application]::Run($f)
