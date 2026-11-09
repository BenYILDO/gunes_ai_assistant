#!/usr/bin/env python3
"""
Whisper .vtt satırlarına sherpa-onnx konuşmacı ayrımı çıktısından konuşmacı etiketi ekler.
Kullanım:  python -I birlestir.py whisper.vtt ayrim.txt cikti.vtt
ayrim.txt satırları:  "0.318 -- 6.865 speaker_00"  (sherpa-onnx-offline-speaker-diarization çıktısı)
Her Whisper satırına, zaman olarak en çok örtüştüğü konuşmacı atanır. Çıktı satırı:  "[0] metin"
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wer  # noqa: E402

vtt, ayrim, cikti = sys.argv[1:4]
parcalar = []
for s in Path(ayrim).read_text(encoding="utf-8", errors="replace").splitlines():
    m = re.match(r"\s*([\d.]+)\s*--\s*([\d.]+)\s+speaker_(\d+)", s)
    if m:
        parcalar.append((float(m.group(1)), float(m.group(2)), int(m.group(3))))
if not parcalar:
    sys.exit("ayrım çıktısında konuşmacı satırı yok")

def zaman(sn):
    return f"{int(sn // 3600):02d}:{int(sn % 3600 // 60):02d}:{sn % 60:06.3f}"


satirlar = ["WEBVTT", ""]
for bas, son, metin in wer.vtt_oku(vtt):
    skor = {}
    for b, e, k in parcalar:
        o = min(son, e) - max(bas, b)
        if o > 0:
            skor[k] = skor.get(k, 0) + o
    etiket = max(skor, key=skor.get) if skor else -1
    satirlar += [f"{zaman(bas)} --> {zaman(son)}", f"[{etiket}] {metin}", ""]
Path(cikti).write_text("\n".join(satirlar), encoding="utf-8")
print(f"{len(parcalar)} konuşmacı parçası, {len(set(k for _,_,k in parcalar))} konuşmacı -> {cikti}")
