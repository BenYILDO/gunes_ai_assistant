#!/usr/bin/env python3
"""
Konuşmacı ayrımı doğruluğu: Whisper (etiketli, "[k] metin") ile Teams transkriptini kelime düzeyinde hizalar,
eşleşen her kelimede Teams'in konuşmacısı ile ayrımın etiketini karşılaştırır. Etiket-isim eşlemesi en iyi
permütasyonla yapılır. Kullanım:  python -I ayrim_olc.py ref.docx etiketli.vtt [--bit 360] [--ad x] [--tablo yol.csv]
UYARI: Teams'in konuşmacı atamaları da referans niteliğinde, mutlak doğru değil.
"""
import argparse
import csv
import itertools
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wer  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("ref"); ap.add_argument("hip")
ap.add_argument("--bit", type=float, default=1e9)
ap.add_argument("--ad", default="ayrim")
ap.add_argument("--tablo", default=None)
a = ap.parse_args()

ref_k, ref_spk = [], []
for spk, t, x in wer.docx_oku(a.ref):
    if t >= a.bit:
        continue
    for w in re.findall(r"\w+", x):
        n = wer.normalize(w)
        if n:
            ref_k.append(n); ref_spk.append(spk)
hip_k, hip_et = [], []
for b, _, x in wer.vtt_oku(a.hip):
    if b >= a.bit:
        continue
    m = re.match(r"\[(-?\d+)\]\s*(.*)", x)
    et, metin = (int(m.group(1)), m.group(2)) if m else (-1, x)
    for w in wer.normalize(metin).split():
        hip_k.append(w); hip_et.append(et)

ops = wer.hizala(ref_k, hip_k)
karisim = defaultdict(Counter)  # gerçek konuşmacı -> etiket -> kelime sayısı
for o, i, j in ops:
    if o == "=":
        karisim[ref_spk[i]][hip_et[j]] += 1
eslesen = sum(sum(c.values()) for c in karisim.values())
gercekler = sorted(karisim)
etiketler = sorted({e for c in karisim.values() for e in c})
en_iyi, en_iyi_dogru = None, -1
for perm in itertools.permutations(etiketler + [None] * len(gercekler), len(gercekler)):
    dogru = sum(karisim[g][e] for g, e in zip(gercekler, perm) if e is not None)
    if dogru > en_iyi_dogru:
        en_iyi, en_iyi_dogru = dict(zip(gercekler, perm)), dogru
acc = en_iyi_dogru / max(eslesen, 1)

# saflık: her etiketi çoğunluk konuşmacısına yazarsak (çok-bire eşleme) doğruluk; küme sayısı fazlaysa adil karşılaştırma
saflik = sum(max(karisim[g][e] for g in gercekler) for e in etiketler) / max(eslesen, 1)
print(f"\n== {a.ad} ==  etiket sayısı: {len([e for e in etiketler if e >= 0])}   saflık (çok-bire) %{saflik*100:.1f}")
print(f"eşleşen {eslesen} kelime üzerinde konuşmacı doğruluğu: %{acc*100:.1f}")
for g in gercekler:
    top = sum(karisim[g].values())
    d = karisim[g][en_iyi[g]] if en_iyi[g] is not None else 0
    print(f"  {g:<22} -> etiket {en_iyi[g]}   %{d/max(top,1)*100:5.1f}  ({d}/{top} kelime)   dağılım: {dict(karisim[g])}")
if a.tablo:
    yeni = not Path(a.tablo).exists()
    with open(a.tablo, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if yeni:
            w.writerow(["ad", "konusmaci_dogrulugu_%", "etiket_sayisi", "eslesen_kelime"])
        w.writerow([a.ad, f"{acc*100:.1f}", len([e for e in etiketler if e >= 0]), eslesen])
