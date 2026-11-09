#!/usr/bin/env python3
"""
Whisper çıktısını (.vtt) Teams transkriptiyle (.docx) karşılaştırır. Yalnızca standart kütüphane.
Kullanım:  python -I wer.py ref.docx hipotez.vtt [--ad tur1] [--tablo sonuc/tablo.csv]
NOT: Teams transkripti de otomatik üretimdir, "gerçek" değil. WER = iki sistemin birbirinden ne kadar uzak olduğu.
Raporlar: genel WER, konuşmacı bazında hata oranı, rakam/özel isim hataları.
"""
import argparse
import csv
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from html import unescape
from pathlib import Path

REF_SATIR = re.compile(r"^(.+?)\s{2,}(\d+:\d{2}(?::\d{2})?)(.*)$")


def sn(ts: str) -> float:
    p = [float(x) for x in ts.replace(",", ".").split(":")]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def docx_oku(yol):
    x = zipfile.ZipFile(yol).read("word/document.xml").decode("utf-8")
    sonuc = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", x, flags=re.S):
        t = unescape("".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, flags=re.S))).strip()
        m = REF_SATIR.match(t)
        if m:
            sonuc.append((m.group(1).strip(), sn(m.group(2)), m.group(3).strip()))
    return sonuc


def vtt_oku(yol):
    sonuc, metin = [], Path(yol).read_text(encoding="utf-8", errors="replace")
    for blok in re.split(r"\n\s*\n", metin):
        satir = [s for s in blok.strip().splitlines() if s.strip()]
        for i, s in enumerate(satir):
            m = re.match(r"(\d+:)?(\d+:\d+[.,]\d+)\s*-->\s*(\d+:)?(\d+:\d+[.,]\d+)", s)
            if m:
                bas = sn((m.group(1) or "") + m.group(2))
                son = sn((m.group(3) or "") + m.group(4))
                sonuc.append((bas, son, " ".join(satir[i + 1 :]).strip()))
                break
    return sonuc


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFC", s).replace("İ", "i").replace("I", "ı").lower()
    s = re.sub(r"[^\w\s]", " ", s)  # noktalama
    s = re.sub(r"_", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def hizala(ref, hip):
    """Kelime düzeyinde Levenshtein; (op, ref_i, hip_j) listesi döner. op: = S D I"""
    n, m = len(ref), len(hip)
    prev = list(range(m + 1))
    yon = [bytearray(m + 1) for _ in range(n + 1)]  # 0:= 1:S 2:D 3:I
    for j in range(1, m + 1):
        yon[0][j] = 3
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        yon[i][0] = 2
        ri = ref[i - 1]
        for j in range(1, m + 1):
            es = prev[j - 1] + (0 if ri == hip[j - 1] else 1)
            sil = prev[j] + 1
            ek = cur[j - 1] + 1
            if es <= sil and es <= ek:
                cur[j], yon[i][j] = es, (0 if ri == hip[j - 1] else 1)
            elif sil <= ek:
                cur[j], yon[i][j] = sil, 2
            else:
                cur[j], yon[i][j] = ek, 3
        prev = cur
    ops, i, j = [], n, m
    while i > 0 or j > 0:
        o = yon[i][j]
        if o in (0, 1):
            ops.append(("=" if o == 0 else "S", i - 1, j - 1)); i -= 1; j -= 1
        elif o == 2:
            ops.append(("D", i - 1, None)); i -= 1
        else:
            ops.append(("I", None, j - 1)); j -= 1
    return ops[::-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ref"); ap.add_argument("hip")
    ap.add_argument("--ad", default=Path(__file__).stem)
    ap.add_argument("--tablo", default=None)
    ap.add_argument("--bit", type=float, default=1e9, help="yalnızca ilk N saniyeyi karşılaştır (kısa ayar turları için)")
    a = ap.parse_args()

    ref_s = [r for r in docx_oku(a.ref) if r[1] < a.bit]
    hip_s = [h for h in vtt_oku(a.hip) if h[0] < a.bit]
    if not ref_s or not hip_s:
        sys.exit(f"boş girdi: ref={len(ref_s)} hip={len(hip_s)}")

    # referans: kelime + konuşmacı + özgün (büyük/küçük harfli) kelime
    ref_k, ref_spk, ref_orj, ref_ilk = [], [], [], []
    kisa_idx = set()  # 1-3 kelimelik (geri bildirim: "hı hı", "tamam") satırların kelimeleri
    for spk, _, t in ref_s:
        orj = re.findall(r"[\w]+", t)
        for k, w in enumerate(orj):
            n = normalize(w)
            if n:
                if len(orj) <= 3:
                    kisa_idx.add(len(ref_k))
                ref_k.append(n); ref_spk.append(spk); ref_orj.append(w); ref_ilk.append(k == 0)
    hip_k = normalize(" ".join(t for _, _, t in hip_s)).split()

    ops = hizala(ref_k, hip_k)
    c = Counter(o for o, _, _ in ops)
    wer = (c["S"] + c["D"] + c["I"]) / len(ref_k)

    # konuşmacı bazında: S/D doğrudan, I en yakın önceki referans kelimesinin konuşmacısına
    spk_hata, spk_say = defaultdict(int), Counter(ref_spk)
    son_spk = ref_spk[0]
    rakam_top = rakam_hata = isim_top = isim_hata = 0
    isim_kume = {normalize(x) for spk, _, _ in ref_s for x in spk.split()}
    kacan = Counter()
    for o, i, j in ops:
        if i is not None:
            son_spk = ref_spk[i]
        if o in ("S", "D", "I"):
            spk_hata[son_spk] += 1
        if i is not None:
            w, orj = ref_k[i], ref_orj[i]
            ra = any(ch.isdigit() for ch in w)
            # özel isim: konuşmacı adları ya da cümle ortasında büyük harfle başlayan kelimeler
            # satır başındaki büyük harf cümle başıdır (Teams her satırı büyük harfle başlatır), isim sayılmaz
            isim = w in isim_kume or (orj[:1].isupper() and not orj.isupper() and not ref_ilk[i])
            if ra:
                rakam_top += 1; rakam_hata += o != "="
            if isim:
                isim_top += 1; isim_hata += o != "="
                if o != "=":
                    kacan[orj] += 1

    # Not: zaman pencereli WER denendi, geçersiz çıktı: Teams satır başına tek zaman damgası veriyor
    # (satırlar ~20 sn'ye kadar uzar), kelime zamanı yok.
    print(f"\n== {a.ad} ==")
    print(f"referans {len(ref_k)} kelime, hipotez {len(hip_k)} kelime")
    print(f"WER {wer*100:.1f}%   (S={c['S']} D={c['D']} I={c['I']})")
    print("konuşmacı bazında hata oranı (ekleme dahil):")
    for spk, say in spk_say.most_common():
        print(f"  {spk:<22} {say:>5} kelime   hata %{spk_hata[spk]/say*100:5.1f}")
    kisa_sil = sum(1 for o, i, _ in ops if o == "D" and i in kisa_idx)
    print(f"silinen {c['D']} kelimenin {kisa_sil} tanesi 1-3 kelimelik kısa satırlardan (hı hı / tamam / evet türü)")
    print(f"rakam hatası   {rakam_hata}/{rakam_top}")
    print(f"özel isim hatası {isim_hata}/{isim_top}   en çok kaçanlar: {kacan.most_common(8)}")

    if a.tablo:
        yeni = not Path(a.tablo).exists()
        Path(a.tablo).parent.mkdir(parents=True, exist_ok=True)
        with open(a.tablo, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            if yeni:
                w.writerow(["ad", "wer_%", "S", "D", "I", "ref_kelime", "hip_kelime", "rakam_hata", "isim_hata"])
            w.writerow([a.ad, f"{wer*100:.1f}", c["S"], c["D"], c["I"], len(ref_k), len(hip_k),
                        f"{rakam_hata}/{rakam_top}", f"{isim_hata}/{isim_top}"])


if __name__ == "__main__":
    main()
