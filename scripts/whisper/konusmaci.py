#!/usr/bin/env python3
"""
Profil tabanlı konuşmacı tanıma (sherpa-onnx C API üzerinden, yalnızca standart kütüphane, pip gerekmez).
Eğitimsiz kümeleme Cemil/Yıldıray'ı ayıramadı; kişi başına ses profili (embedding merkezi) ile sınıflama ayırıyor.

  sina     Tek kayıt, Teams transkriptiyle: zamana göre iki yarı, her yarı diğer yarının profiliyle etiketlenir
           (aynı toplantı içi üst sınır; farklı toplantıya genelleme AYRICA doğrulanmalı). Çıktı: etiketli vtt ("[k] metin")
           -> ayrim_olc.py ile ölçülür.
  profil   Kayıt + Whisper vtt + Teams docx'ten kişi profillerini JSON'a yazar.
  etiketle Yeni kayıt + Whisper vtt + profil.json -> "[Ad] metin" satırlı vtt (Teams transkripti gerekmez).

Ortak:  --model embedding.onnx  --dll <sherpa bin klasörü>  --wav yol (16 kHz mono)
Not: profiller ses biyometrisidir (kişisel veri). Dosyayı git dışında ve erişimi kısıtlı tutun.
"""
import argparse
import array
import ctypes
import json
import math
import os
import sys
import wave
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wer  # noqa: E402


class Cikarici:
    def __init__(self, model, dll, wav, thread=4):
        os.add_dll_directory(dll)
        lib = ctypes.CDLL(str(Path(dll) / "sherpa-onnx-c-api.dll"))
        P = ctypes.c_void_p

        class Cfg(ctypes.Structure):
            _fields_ = [("model", ctypes.c_char_p), ("num_threads", ctypes.c_int32),
                        ("debug", ctypes.c_int32), ("provider", ctypes.c_char_p)]

        lib.SherpaOnnxCreateSpeakerEmbeddingExtractor.restype = P
        lib.SherpaOnnxCreateSpeakerEmbeddingExtractor.argtypes = [ctypes.POINTER(Cfg)]
        lib.SherpaOnnxSpeakerEmbeddingExtractorDim.argtypes = [P]
        lib.SherpaOnnxSpeakerEmbeddingExtractorCreateStream.restype = P
        lib.SherpaOnnxSpeakerEmbeddingExtractorCreateStream.argtypes = [P]
        lib.SherpaOnnxOnlineStreamAcceptWaveform.argtypes = [P, ctypes.c_int32, ctypes.POINTER(ctypes.c_float), ctypes.c_int32]
        lib.SherpaOnnxOnlineStreamInputFinished.argtypes = [P]
        lib.SherpaOnnxSpeakerEmbeddingExtractorIsReady.argtypes = [P, P]
        lib.SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding.restype = ctypes.POINTER(ctypes.c_float)
        lib.SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding.argtypes = [P, P]
        lib.SherpaOnnxSpeakerEmbeddingExtractorDestroyEmbedding.argtypes = [ctypes.POINTER(ctypes.c_float)]
        lib.SherpaOnnxDestroyOnlineStream.argtypes = [P]
        self.lib = lib
        cfg = Cfg(str(model).encode("utf-8"), thread, 0, b"cpu")
        self.ext = lib.SherpaOnnxCreateSpeakerEmbeddingExtractor(ctypes.byref(cfg))
        if not self.ext:
            sys.exit("embedding modeli açılamadı")
        self.dim = lib.SherpaOnnxSpeakerEmbeddingExtractorDim(self.ext)
        with wave.open(str(wav)) as w:
            if w.getframerate() != 16000 or w.getnchannels() != 1:
                sys.exit("wav 16 kHz mono olmalı")
            self.sr = w.getframerate()
            ham = array.array("h")
            ham.frombytes(w.readframes(w.getnframes()))
        self.ses = [x / 32768.0 for x in ham]

    def embed(self, b, e):
        lib, parca = self.lib, self.ses[int(b * self.sr): int(e * self.sr)]
        if len(parca) < self.sr // 2:
            return None
        arr = (ctypes.c_float * len(parca))(*parca)
        st = lib.SherpaOnnxSpeakerEmbeddingExtractorCreateStream(self.ext)
        lib.SherpaOnnxOnlineStreamAcceptWaveform(st, self.sr, arr, len(parca))
        lib.SherpaOnnxOnlineStreamInputFinished(st)
        v = None
        if lib.SherpaOnnxSpeakerEmbeddingExtractorIsReady(self.ext, st):
            p = lib.SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding(self.ext, st)
            v = [p[i] for i in range(self.dim)]
            lib.SherpaOnnxSpeakerEmbeddingExtractorDestroyEmbedding(p)
        lib.SherpaOnnxDestroyOnlineStream(st)
        if v is None:
            return None
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]


def cos(x, y):
    return sum(i * j for i, j in zip(x, y))


def merkez(vs):
    c = [sum(v[i] for v in vs) / len(vs) for i in range(len(vs[0]))]
    n = math.sqrt(sum(x * x for x in c)) or 1.0
    return [x / n for x in c]


def metin_etiket(satirlar, b, e, metin):
    """Whisper satırının kelimelerini yakın zamanlı Teams satırlarıyla karşılaştırır (en az %60 örtüşme)."""
    kel = wer.normalize(metin).split()
    if len(kel) < 4:
        return None
    en, ad = 0.0, None
    for adi, t, m in satirlar:
        if b - 12 <= t <= e + 3:
            r = wer.normalize(m).split()
            ort = sum((Counter(kel) & Counter(r)).values()) / len(kel)
            if ort > en:
                en, ad = ort, adi.split()[0]
    return ad if en >= 0.6 else None


def tani(profiller, v, esik):
    skor = {k: cos(v, c) for k, c in profiller.items()}
    k = max(skor, key=skor.get)
    return k if skor[k] >= esik else "?"


def vtt_yaz(yol, satirlar):
    def z(sn):
        return f"{int(sn // 3600):02d}:{int(sn % 3600 // 60):02d}:{sn % 60:06.3f}"
    out = ["WEBVTT", ""]
    for b, e, metin in satirlar:
        out += [f"{z(b)} --> {z(e)}", metin, ""]
    Path(yol).write_text("\n".join(out), encoding="utf-8")


def etiketli_cuelar(cik, satirlar, cues, enaz):
    """(b, e, metin, teams_adi|None, embedding|None) listesi."""
    sonuc = []
    for b, e, metin in cues:
        v = cik.embed(b, e) if e - b >= enaz else None
        sonuc.append((b, e, metin, metin_etiket(satirlar, b, e, metin) if v else None, v))
    return sonuc


def etiketle_ve_yaz(cuelar, profiller, esik, yol, sayisal):
    adlar = sorted(profiller)
    cikti, onceki = [], "?"
    for b, e, metin, _, v in cuelar:
        k = tani(profiller, v, esik) if v else onceki  # çok kısa satır: önceki konuşmacı
        onceki = k
        etiket = str(adlar.index(k)) if (sayisal and k in adlar) else k
        cikti.append((b, e, f"[{etiket}] {metin}"))
    vtt_yaz(yol, cikti)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("komut", choices=["sina", "profil", "etiketle"])
    ap.add_argument("--wav", required=True); ap.add_argument("--vtt", required=True)
    ap.add_argument("--model", required=True); ap.add_argument("--dll", required=True)
    ap.add_argument("--ref", help="Teams docx (sina, profil)")
    ap.add_argument("--profil", help="profil.json (profil: yazılır, etiketle: okunur)")
    ap.add_argument("--cikti", help="etiketli vtt (sina, etiketle)")
    ap.add_argument("--min", type=float, default=1.5, help="profil/embedding için en kısa satır (sn)")
    ap.add_argument("--esik", type=float, default=0.35, help="bu benzerliğin altı '?' (bilinmeyen)")
    ap.add_argument("--thread", type=int, default=4)
    a = ap.parse_args()

    cik = Cikarici(a.model, a.dll, a.wav, a.thread)
    cues = wer.vtt_oku(a.vtt)

    if a.komut == "etiketle":
        pr = json.loads(Path(a.profil).read_text(encoding="utf-8"))
        profiller = pr["profiller"]
        if pr.get("boyut") != cik.dim:
            sys.exit("profil başka bir embedding modeliyle kurulmuş")
        cu = etiketli_cuelar(cik, [], cues, 0.8)
        etiketle_ve_yaz(cu, profiller, a.esik, a.cikti, sayisal=False)
        print(f"{len(cu)} satır etiketlendi -> {a.cikti}")
        return

    satirlar = wer.docx_oku(a.ref)
    cu = etiketli_cuelar(cik, satirlar, cues, a.min if a.komut == "profil" else 0.8)
    et = [c for c in cu if c[3] and c[4] and c[1] - c[0] >= a.min]
    print(f"{len(et)} Teams ile eşleşen etiketli satır: {dict(Counter(c[3] for c in et))}")

    if a.komut == "profil":
        gruplar = defaultdict(list)
        for c in et:
            gruplar[c[3]].append(c[4])
        pr = {"boyut": cik.dim, "model": Path(a.model).name,
              "profiller": {k: merkez(v) for k, v in gruplar.items()}, "ornek": {k: len(v) for k, v in gruplar.items()}}
        Path(a.profil).write_text(json.dumps(pr), encoding="utf-8")
        print(f"profil yazıldı: {a.profil}")
        return

    # sina: iki yarıdan çapraz profil
    orta = sorted(c[0] for c in et)[len(et) // 2]
    yari = lambda c: 0 if c[0] < orta else 1
    prof = []
    for h in (0, 1):
        g = defaultdict(list)
        for c in et:
            if yari(c) != h:  # h. yarıyı, DİĞER yarının profiliyle etiketleriz
                g[c[3]].append(c[4])
        prof.append({k: merkez(v) for k, v in g.items()})
    dogru, topla, kar = Counter(), Counter(), defaultdict(Counter)
    for c in et:
        tah = tani(prof[yari(c)], c[4], -1)
        topla[c[3]] += 1; dogru[c[3]] += tah == c[3]; kar[c[3]][tah] += 1
    print(f"çapraz sınama (zaman bölmeli) satır doğruluğu: %{100 * sum(dogru.values()) / sum(topla.values()):.1f}")
    for k in topla:
        print(f"   {k}: {dogru[k]}/{topla[k]}  {dict(kar[k])}")
    if a.cikti:
        adlar = sorted(prof[0])
        cikti, onceki = [], "?"
        for b, e, metin, _, v in cu:
            h = 0 if b < orta else 1
            k = tani(prof[h], v, a.esik) if v else onceki
            onceki = k
            cikti.append((b, e, f"[{adlar.index(k) if k in adlar else -1}] {metin}"))
        vtt_yaz(a.cikti, cikti)
        print(f"etiketli vtt: {a.cikti}  (ölçüm: ayrim_olc.py ile)")


if __name__ == "__main__":
    main()
