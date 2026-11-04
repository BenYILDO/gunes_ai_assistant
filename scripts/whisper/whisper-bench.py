#!/usr/bin/env python3
"""
Whisper ölçümü: aynı dosyayı farklı modellerle çevirip süreyi karşılaştırır.
Kullanım:  python whisper-bench.py "C:\\yol\\toplanti.mp4" --dakika 5
Video/ses fark etmez (faster-whisper sesi kendisi okur, ffmpeg gerekmez).
Sonuçlar --cikti klasörüne <model>.txt olarak yazılır; metin yerelde kalır.
"""
import argparse
import os
import sys
import time
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dosya")
    ap.add_argument("--dakika", type=float, default=5.0, help="dosyanın ilk kaç dakikası çevrilsin")
    ap.add_argument("--modeller", default="small,large-v3-turbo,medium", help="virgülle ayrılmış")
    ap.add_argument("--threads", type=int, default=8, help="işlemci iş parçacığı (bilgisayarı kilitlememek için 8)")
    ap.add_argument("--beam", type=int, default=5)
    ap.add_argument("--cikti", default="whisper-sonuc")
    a = ap.parse_args()

    if not os.path.exists(a.dosya):
        sys.exit(f"Dosya bulunamadı: {a.dosya}")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("faster-whisper kurulu değil:  pip install faster-whisper psutil")
    try:
        import psutil

        proc = psutil.Process()
    except ImportError:
        proc = None

    out = Path(a.cikti)
    out.mkdir(parents=True, exist_ok=True)
    secs = a.dakika * 60
    rows = []

    for name in [m.strip() for m in a.modeller.split(",") if m.strip()]:
        print(f"\n=== {name} ===", flush=True)
        try:
            t0 = time.time()
            model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=a.threads)
            load = time.time() - t0
            print(f"model yüklendi ({load:.0f} sn)", flush=True)

            t1 = time.time()
            segments, info = model.transcribe(
                a.dosya, language="tr", beam_size=a.beam, vad_filter=True, clip_timestamps=[0.0, secs]
            )
            lines, last = [], 0.0
            for s in segments:
                lines.append(f"[{s.start:7.1f}] {s.text.strip()}")
                last = s.end
                print(f"\r  ilerleme: {last:6.0f} sn ses işlendi", end="", flush=True)
            took = time.time() - t1
            audio = min(secs, info.duration)
            rtf = took / audio if audio else 0
            ram = f"{proc.memory_info().rss / 1e9:.1f} GB" if proc else "?"
            (out / f"{name}.txt").write_text("\n".join(lines), encoding="utf-8")
            print(f"\n  ses: {audio:.0f} sn · süre: {took:.0f} sn · hız: {rtf:.2f}x (1 = gerçek zamanlı) · RAM: {ram}")
            print("  önizleme:", " ".join(l.split('] ', 1)[-1] for l in lines[:6])[:400])
            rows.append((name, audio, took, rtf, ram))
            del model
        except Exception as e:  # bir model indirilemese de diğerleri denensin
            print(f"\n  HATA: {type(e).__name__}: {e}")
            rows.append((name, 0, 0, 0, "hata"))

    print("\n==== ÖZET ====")
    print(f"{'model':<18}{'ses(sn)':>8}{'süre(sn)':>10}{'hız':>8}{'RAM':>9}   1 saatlik toplantı ≈")
    for n, au, t, r, ram in rows:
        est = f"{r * 60:.0f} dk" if r else "-"
        print(f"{n:<18}{au:>8.0f}{t:>10.0f}{r:>7.2f}x{ram:>9}   {est}")
    print(f"\nMetinler: {out.resolve()}")


if __name__ == "__main__":
    main()
