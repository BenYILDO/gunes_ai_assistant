# Gunes: arama sirasinda sesi yerel olarak yakalar (ekran paylasimi/izin penceresi YOK).
#   - mic.raw     : mikrofonunuz (varsayilan "iletisim" mikrofonu; -Mic ile ad parcasi verilirse o cihaz)
#   - sys-N.raw   : hoparlor/kulaklik CIKISI (WASAPI loopback), her aktif cikis cihazi icin ayri dosya
# Cikti: 16 kHz, 16 bit, tek kanal HAM PCM (basliksiz); sessiz anlar sifirla doldurulur, boylece zaman hizasi korunur.
# Durdurma: stdin'e "q" yazin ya da stdin'i kapatin (Gunes sunucusu kapanirsa program kendiliginden biter).
# Yalnizca standart Windows bilesenlerini kullanir; hicbir sey indirmez, hicbir yere gondermez.
param([Parameter(Mandatory)][string]$Out, [string]$Mic = '', [int]$MaxSeconds = 14400)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$src = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Ses {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint n);
    [PreserveSig] int Item(uint i, out IMMDevice dev);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore ps);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
  }
  [StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint c);
    [PreserveSig] int GetAt(uint i, out PROPERTYKEY k);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT v);
    [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT v);
    [PreserveSig] int Commit();
  }
  [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioClient {
    [PreserveSig] int Initialize(int shareMode, int streamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, ref Guid sessionGuid);
    [PreserveSig] int GetBufferSize(out uint n);
    [PreserveSig] int GetStreamLatency(out long l);
    [PreserveSig] int GetCurrentPadding(out uint p);
    [PreserveSig] int IsFormatSupported(int shareMode, IntPtr fmt, out IntPtr closest);
    [PreserveSig] int GetMixFormat(out IntPtr fmt);
    [PreserveSig] int GetDevicePeriod(out long def, out long min);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr h);
    [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }
  [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpc);
    [PreserveSig] int ReleaseBuffer(uint frames);
    [PreserveSig] int GetNextPacketSize(out uint n);
  }
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

  static volatile bool stop = false;
  static readonly object logLock = new object();
  static void Log(string s) { lock (logLock) { Console.Out.WriteLine(s); Console.Out.Flush(); } }

  static string FriendlyName(IMMDevice d) {
    try {
      IPropertyStore ps; if (d.OpenPropertyStore(0, out ps) != 0) return "?";
      PROPERTYKEY k = new PROPERTYKEY(); k.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.pid = 14;
      PROPVARIANT v; if (ps.GetValue(ref k, out v) != 0) return "?";
      string n = (v.vt == 31 && v.p != IntPtr.Zero) ? Marshal.PtrToStringUni(v.p) : "?";
      PropVariantClear(ref v); return n;
    } catch { return "?"; }
  }

  class Dev { public string Id; public string Name; }

  // Yalnizca kimlik ve ad doner (COM nesneleri iplikler arasinda gecmez: her iplik kendi nesnelerini olusturur)
  static List<Dev> Active(IMMDeviceEnumerator en, int flow) {
    var l = new List<Dev>();
    IMMDeviceCollection c; if (en.EnumAudioEndpoints(flow, 1, out c) != 0) return l;
    uint n; c.GetCount(out n);
    for (uint i = 0; i < n; i++) {
      IMMDevice d; if (c.Item(i, out d) != 0) continue;
      string id; d.GetId(out id);
      l.Add(new Dev { Id = id, Name = FriendlyName(d) });
    }
    return l;
  }

  // Dogrusal ornek donusturucu: kaynak hizi -> 16 kHz
  class Resampler {
    double step; double pos = 0; float prev = 0;
    public Resampler(int rate) { step = rate / 16000.0; }
    public void Process(float[] x, int n, List<short> o) {
      if (n == 0) return;
      while (true) {
        int i = (int)Math.Floor(pos);
        if (i + 1 >= n) break;
        float a = i < 0 ? prev : x[i]; float b = x[i + 1];
        float f = (float)(pos - i);
        float v = a + (b - a) * f;
        if (v > 1f) v = 1f; if (v < -1f) v = -1f;
        o.Add((short)(v * 32767f));
        pos += step;
      }
      pos -= n; prev = x[n - 1];
    }
  }

  static void Worker(string tag, string devId, bool loopback, string path, Stopwatch clock) {
    FileStream fs = null; IAudioClient ac = null;
    try {
      var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDevice dev; if (en.GetDevice(devId, out dev) != 0) { Log("ERR|" + tag + "|GetDevice"); return; }
      Guid ic = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"); object o;
      if (dev.Activate(ref ic, 23, IntPtr.Zero, out o) != 0) { Log("ERR|" + tag + "|Activate"); return; }
      ac = (IAudioClient)o;
      IntPtr pf; if (ac.GetMixFormat(out pf) != 0) { Log("ERR|" + tag + "|GetMixFormat"); return; }
      int tagFmt = (ushort)Marshal.ReadInt16(pf, 0); int ch = (ushort)Marshal.ReadInt16(pf, 2); int rate = Marshal.ReadInt32(pf, 4); int bits = (ushort)Marshal.ReadInt16(pf, 14);
      bool isFloat = tagFmt == 3;
      if (tagFmt == 0xFFFE) isFloat = Marshal.ReadInt32(pf, 24) == 3;
      Guid g = Guid.Empty;
      int hr = ac.Initialize(0, loopback ? 0x00020000 : 0, 10000000L, 0, pf, ref g);
      if (hr != 0) { Log("ERR|" + tag + "|Initialize 0x" + hr.ToString("X")); return; }
      Guid icc = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"); object oc;
      if (ac.GetService(ref icc, out oc) != 0) { Log("ERR|" + tag + "|GetService"); return; }
      IAudioCaptureClient cap = (IAudioCaptureClient)oc;
      fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read);
      if (ac.Start() != 0) { Log("ERR|" + tag + "|Start"); return; }
      Log("OK|" + tag + "|" + rate + " Hz, " + ch + " kanal, " + bits + " bit" + (isFloat ? " float" : ""));
      var rs = new Resampler(rate); var outBuf = new List<short>(); long written = 0;
      float[] mono = new float[0];
      while (!stop) {
        uint next; cap.GetNextPacketSize(out next);
        while (next > 0) {
          IntPtr data; uint frames, flags; ulong dp, qpc;
          if (cap.GetBuffer(out data, out frames, out flags, out dp, out qpc) != 0) break;
          int n = (int)frames;
          if (mono.Length < n) mono = new float[n];
          if ((flags & 2) != 0) { for (int i = 0; i < n; i++) mono[i] = 0f; }   // AUDCLNT_BUFFERFLAGS_SILENT
          else {
            int bytesPer = bits / 8;
            for (int i = 0; i < n; i++) {
              float sum = 0f;
              for (int c = 0; c < ch; c++) {
                IntPtr p = IntPtr.Add(data, (i * ch + c) * bytesPer);
                float s;
                if (isFloat && bits == 32) { s = BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(p)), 0); }
                else if (bits == 16) { s = Marshal.ReadInt16(p) / 32768f; }
                else if (bits == 32) { s = Marshal.ReadInt32(p) / 2147483648f; }
                else if (bits == 24) { int v = Marshal.ReadByte(p) | (Marshal.ReadByte(p, 1) << 8) | (Marshal.ReadByte(p, 2) << 16); if ((v & 0x800000) != 0) v |= unchecked((int)0xFF000000); s = v / 8388608f; }
                else s = 0f;
                sum += s;
              }
              mono[i] = sum / ch;
            }
          }
          cap.ReleaseBuffer(frames);
          outBuf.Clear(); rs.Process(mono, n, outBuf);
          var bytes = new byte[outBuf.Count * 2];
          for (int i = 0; i < outBuf.Count; i++) { bytes[2 * i] = (byte)(outBuf[i] & 0xFF); bytes[2 * i + 1] = (byte)((outBuf[i] >> 8) & 0xFF); }
          fs.Write(bytes, 0, bytes.Length); written += outBuf.Count;
          cap.GetNextPacketSize(out next);
        }
        // Loopback'te cikis sessizken paket gelmez: duvar saatine gore sifirla doldur (zaman hizasi korunur)
        long target = (long)(clock.Elapsed.TotalSeconds * 16000.0);
        if (written < target - 800) { long pad = target - written; var z = new byte[pad * 2]; fs.Write(z, 0, z.Length); written += pad; }
        Thread.Sleep(15);
      }
      ac.Stop();
    } catch (Exception e) { Log("ERR|" + tag + "|" + e.GetType().Name + ": " + e.Message); }
    finally { if (fs != null) { fs.Flush(); fs.Dispose(); } }
  }

  public static int Run(string outDir, string micMatch, int maxSeconds) {
    Directory.CreateDirectory(outDir);
    var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    var clock = Stopwatch.StartNew();
    var threads = new List<Thread>();

    // Mikrofon: istenen ad parcasi, yoksa varsayilan "iletisim" cihazi, o da yoksa varsayilan cihaz
    Dev mic = null;
    if (!string.IsNullOrEmpty(micMatch))
      foreach (var d in Active(en, 1)) if (d.Name.IndexOf(micMatch, StringComparison.OrdinalIgnoreCase) >= 0) { mic = d; break; }
    if (mic == null) {
      IMMDevice md;
      if (en.GetDefaultAudioEndpoint(1, 2, out md) != 0) en.GetDefaultAudioEndpoint(1, 0, out md);
      if (md != null) { string id; md.GetId(out id); mic = new Dev { Id = id, Name = FriendlyName(md) }; }
    }
    if (mic != null) {
      Log("DEV|mikrofon|" + mic.Name);
      var mid = mic.Id; var tm = new Thread(() => Worker("mic", mid, false, Path.Combine(outDir, "mic.raw"), clock)); tm.IsBackground = true; threads.Add(tm);
    } else Log("ERR|mic|mikrofon cihazi yok");

    // Hoparlor/kulaklik cikisi: HER aktif cikis cihazi (Teams hangisine caliyorsa o yakalanir)
    int idx = 0;
    foreach (var d in Active(en, 0)) {
      int k = idx++; var did = d.Id;
      Log("DEV|cikis|" + d.Name);
      var t = new Thread(() => Worker("sys-" + k, did, true, Path.Combine(outDir, "sys-" + k + ".raw"), clock)); t.IsBackground = true; threads.Add(t);
    }
    if (idx == 0) Log("ERR|sys|aktif cikis cihazi yok");
    foreach (var t in threads) t.Start();

    // stdin: "q" ya da kapanma = dur
    var rd = new Thread(() => { try { string l; while ((l = Console.In.ReadLine()) != null) { if (l.Trim().ToLower() == "q") break; } } catch { } stop = true; });
    rd.IsBackground = true; rd.Start();
    Log("READY");
    while (!stop && clock.Elapsed.TotalSeconds < maxSeconds) Thread.Sleep(100);
    stop = true;
    foreach (var t in threads) t.Join(5000);
    Log("DONE|" + (int)clock.Elapsed.TotalSeconds);
    return 0;
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
exit ([Ses]::Run($Out, $Mic, $MaxSeconds))
