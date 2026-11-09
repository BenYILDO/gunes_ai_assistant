# Yerel toplantı transkripti — ölçüm raporu

Kayıt: Teams toplantısı, 20 dk 21 sn, 3 konuşmacı, Türkçe. Referans: Teams'in kendi transkripti (.docx).
Donanım: Intel Core Ultra 5 235U, 31 GB RAM, GPU yok. Her şey yerel (whisper.cpp + sherpa-onnx), hiçbir veri dışarı gitmedi.

> **Referansın sınırı:** Teams transkripti de otomatik üretim. Elle karşılaştırmada Whisper çoğu yerde Teams'ten daha doğruydu,
> Teams ise üst üste konuşmaları birleştirip konuşmacıyı karıştırıyor. WER = iki sistemin uyuşmazlığı, mutlak doğruluk değil.
> Teams satır başına tek zaman damgası verdiği için zaman pencereli bir ölçü geçersiz çıktı.

## Önerilen ayar (transkript)
`whisper-cli -m ggml-large-v3-turbo-q5_0.bin -l tr -t 12 --vad -vm ggml-silero-v6.2.0.bin -bs 1 -bo 1`  (greedy)

| Ölçüm | Değer |
|---|---|
| WER (tam kayıt, Türkçe normalizasyonlu) | **%30,4** (S=377 D=355 I=60 / 2605 kelime) |
| Hız | **1,01× gerçek zaman** (20,4 dk ses için 20,1 dk) |
| Tepe RAM | 1,0 GB |
| Konuşmacı bazında hata | Birsen %31,3 · Yıldıray %30,0 · Cemil %29,2 |
| Rakam hatası | 9/13 (zayıf nokta: tutar/fatura numaralarına güvenmeyin) |

Beam 5 ile aynı model: %30,2 WER, 0,62×. Greedy 1,6× hızlı, doğruluk aynı (fark gürültü içinde).
`large-v3` (2,95 GB, f16, 4,2 GB RAM) ilk 360 sn'de %28,2 / 0,37× verdi: turbo'dan daha doğru değil, yarı hız. 8-10 GB RAM izni bu kayıtta fark yaratmadı.

## Tur tablosu
Tam kayıt (1221 sn):

| Tur | Ayar | WER | Hız | Tepe RAM |
|---|---|---|---|---|
| t1 | medium + VAD | %34,4 | 0,65× | 2,4 GB |
| **final** | **turbo-q5 + VAD, 12 iş parçacığı** | **%30,2** | 0,62× | 1,1 GB |
| final3 | turbo-q5 + VAD, **greedy** (`-bs 1 -bo 1`) | %30,4 | **1,01×** | 1,0 GB |
| final2 | turbo (nicemlenmemiş, `ggml-large-v3-turbo.bin`) + VAD, 12 iş parçacığı | %29,9 | 0,53× | 2,1 GB |

Not: nicemlenmemiş turbo ilk 360 sn'de %27,2 ve 0,75× vermişti (q5: %28,3, 0,46×), ama tam kayıtta fark kayboldu:
%0,3 puanlık WER kazancı, daha yavaş ve 2× RAM. 360 sn'lik hız ölçümü tam kaydı temsil etmiyor (ısınma/arka plan yükü).
**Sonuç: q5 pratik tercih** (aynı doğruluk, yarı RAM, daha hızlı).

İlk 360 sn (ayar turları):

| Tur | Ayar | WER | Hız |
|---|---|---|---|
| t2 | small | %34,8 | 1,63× |
| t3 | medium | %32,5 | 0,56× |
| t1 | medium + VAD | %30,9 | 0,65× |
| t4 | turbo-q5 | %30,5 | 0,49× |
| t5 | turbo-q5 + VAD | %28,3 | 0,46× |
| t6 | turbo f16 + VAD | %27,2 | 0,75× |
| **t7** | **turbo-q5 + VAD + greedy** | **%27,9** | **1,41×** |
| t8 | turbo f16 + VAD + greedy | %28,3 | 0,73× |
| t9 | large-v3 f16 + VAD (4,2 GB RAM) | %28,2 | 0,37× |
| s-vad | small + VAD | %34,9 | 1,40× |
| s-mc0 | small, `--max-context 0` | %35,6 | 1,75× |
| s-beam8 | small, `--beam-size 8` | %36,5 | 1,34× |
| s-prompt | small, `--prompt` (ad/terim) | %36,9 | 1,52× |

small ile iş parçacığı: 6 → 1,39×, 8 → 1,63×, 12 → 1,68×.

Çıkarımlar: model seçimi (turbo-q5) ve VAD kazandırdı; `--prompt`, `--max-context 0`, beam 8 kazandırmadı.
`--prompt` Windows komut satırında Türkçe karakterlerle bozulmuş olabilir (doğrulanmadı).

## Konuşmacı ayrımı (sherpa-onnx, pyannote-segmentation-3-0 + embedding, 3 küme)

| Embedding | Doğruluk | Süre | Tepe RAM |
|---|---|---|---|
| **wespeaker_en_voxceleb_resnet34_LM** | **%68,0** | 333 sn (3,7×) | 248 MB |
| eres2net_base (zh-cn) | %59,4 | 386 sn (3,2×) | 437 MB |
| campplus zh_en | %41,8 | 237 sn (5,2×) | 275 MB |

wespeaker ile kişi bazında: Yıldıray %100, Birsen %84,5, **Cemil %1,3** (kelimelerinin çoğu Yıldıray'ın etiketine gidiyor).
4 ve 5 küme de toplamı iyileştirmedi (%68,0 / %66,9; saflık ~%69): iki sesin embedding'i ayrışmıyor.
Olası neden (doğrulanmadı): aynı odada tek mikrofon. Kanal bazlı kayıt ya da ek metin ipuçları gerekebilir.

## İkinci tur: iyileştirme denemeleri (hiçbiri kazandırmadı)
Kaynaklar: ses ön işleme önerileri ([pyvideotrans](https://en.pyvideotrans.com/blog/ffmpeg-nosie)), Windows `--prompt` kod sayfası
([whisper.cpp#399](https://github.com/ggerganov/whisper.cpp/issues/399)), sherpa-onnx eşik/küme ayarı.

Transkript (small, ilk 360 sn, baz %34,8):

| Deneme | WER | Not |
|---|---|---|
| `loudnorm=I=-16:TP=-1.5:LRA=11` | %35,3 | kayıt zaten -20 dB ortalama, tek kanal |
| `highpass=100, afftdn=nr=10` | %35,7 | rakam hatası 7/7'ye çıktı |
| kısa `--prompt` (yalnızca isimler) | %37,2 | "Yıldıray" doğru yazılıyor; Teams referansı "Yıldırım" yazdığı için WER'de kayıp görünüyor olabilir |
| `-sns -nth 0.3` | %34,8 | fark yok |

Konuşmacı ayrımı (wespeaker, eşik modu): eşik 0,4 → 27 etiket (doğruluk %41,4, saflık %95,3); 0,3 → 49 etiket (%30,3, saflık %96,7).
Eşik düşürmek kişileri onlarca parçaya böler, Cemil/Yıldıray ayrışmasını çözmez. Kayıt tek kanal (Teams karışık 16 kHz mono, 64 kb/s AAC): kanal bazlı ayırma mümkün değil.

### Üçüncü tur: reverb-diarization segmentasyonu (Hugging Face'ten indirildi, hash doğrulandı)
([makale](https://arxiv.org/pdf/2410.03930), pyannote 3.0 ile aynı mimari, Rev verisiyle eğitilmiş.) `ayrim.ps1 -Segmentasyon <onnx>` ile.

| Segmentasyon + embedding | Küme | Doğruluk | Süre / RAM | Cemil |
|---|---|---|---|---|
| pyannote-3-0 + wespeaker (önceki en iyi) | 3 | %68,0 | 3,7× / 248 MB | %1,3 |
| reverb-v1 + wespeaker | 3 | %71,4 | 2,9× / 269 MB | %1,4 |
| reverb-v1 + wespeaker | 4 | %71,0 | | %1,4 |
| **reverb-v1 + campplus** | 3 | **%73,4** | | %1,4 |
| reverb-v1 + eres2net | 3 | %43,6 | | %4,1 |
| reverb-v2 + wespeaker | 3 | %44,2 (2 etiket) | 0,6× / 856 MB | %2,5 |

Birsen ve Yıldıray %95-99 ayrışıyor; Cemil hiçbir kombinasyonda ayrışmıyor (kelimelerinin çoğu Yıldıray'ın etiketine gidiyor, campplus'ta 469/483).
Segmentasyon gerçekte yalnızca ~2 konuşmacı süresi üretiyor (3. etiket 8-49 sn): sorun kümelemede değil, ses benzerliğinde/kayıt koşulunda.
Altı ek embedding (GitHub `speaker-recongition-models` sürümü, boyutları sürümle birebir; hash yayımlanmamış) reverb-v1 ile denendi:
TitaNet small %73,6 · TitaNet large %73,3 · wespeaker cnceleb %73,4 · SpeakerNet %59,4 · wespeaker CAM++ %40,8 · eres2net large %43,1.
Hepsinde Cemil %1,4: Cemil ile Yıldıray'ın sesi kullanıcı tarafından klipleri dinleyerek de ayrı doğrulandı (Teams etiketleri doğru),
yani sorun ses benzerliği değil, **eğitimsiz kümelemenin** iki sesi tek küme yapması.

### Dördüncü tur: profil tabanlı tanıma (`konusmaci.py`) — kümelemeyi aşıyor
Aynı embedding'ler Teams etiketli satırlardan kişi profili (merkez) kurulunca ayırıyor. Zaman bölmeli çapraz sınama
(her yarı, diğer yarının profiliyle etiketlenir; 166 etiketli satır):

| Yöntem | Satır doğruluğu | Kelime doğruluğu (`ayrim_olc.py`) | Cemil |
|---|---|---|---|
| kümeleme (en iyi: reverb-v1 + campplus) | | %73,4 | %1,4 |
| **profil, TitaNet small (192 boyut)** | **%99,4** | **%95,9** | **%96,5** |
| profil, wespeaker (aynı satırlar, ön sınama) | %94,0 | | |

Kişi ayrımı: Birsen %94,3 · Cemil %96,5 · Yıldıray %97,9. Embedding çıkarımı yalnızca sherpa C API + standart `ctypes` (pip gerekmez).
**Sınır (ilk kayıt):** profil ve test aynı toplantıdan. Farklı toplantıya genelleme aşağıdaki ikinci kayıtla sınandı.

### İkinci toplantı (farklı katılımcılar): transkript ve profil genellemesi
Kayıt: 30,6 dk, 6 konuşmacı (yalnızca Yıldıray birinci toplantıyla ortak), Teams transkripti referans.

| Ölçüm | Değer |
|---|---|
| Önerilen ayar (turbo-q5 + VAD + greedy) | WER **%24,2** (S=456 D=338 I=66 / 3561 kelime), **1,2× gerçek zaman**, tepe RAM 1,1 GB |
| Rakam hatası | **34/80** (birinci kayıtta 9/13): tutar, tarih, numara güvenilmez |
| Konuşmacı bazında hata | Özer %18,6 · Yıldıray %25,8 · Necmi %26,3 · Şeref %28,6 · Uğur %37,4 · Kerem %43,6 |

**Profil genellemesi** (birinci toplantıdan kurulan TitaNet small profili, ikinci toplantıda Teams etiketli 247 satır):

| Konuşmacı | Satır | Profile ortalama benzerlik | Sonuç |
|---|---|---|---|
| Yıldıray (profilde var) | 40 | 0,72 (0,48..0,82) | **40/40 doğru** |
| Özer, Kerem, Necmi, Şeref, Uğur (profilde yok) | 207 | 0,23-0,46 | eşik 0,40'ta %94,7 reddedildi (`?`), 0,45'te %97,1 |

Eşik 0,40-0,45: bilinen kişi %100 tanındı, bilinmeyenlerin %95-97'si reddedildi; 0,50 üstünde bilinen kişi kaybolmaya başlıyor (%97,5). Varsayılan 0,40.
Aynı toplantıda 6 kişilik çapraz sınama: %94,3 (Özer 145/146, Kerem 33/34, Yıldıray 40/40, Necmi 15/15; Şeref 0/7 ve Uğur 0/5: profil için çok az konuşma, zaman bölmesinde örnek kalmıyor).
**Sınırlar:** profilli tek kişi (Yıldıray) farklı toplantıda sınandı; iki kayıt da Teams karışık mono. Az örnekli kişilerde (5-7 satır) tanıma başarısız oldu; profil için gereken en az konuşma miktarı ölçülmedi. Ses profili biyometriktir.
Profiller ses biyometrisidir (kişisel veri): `sonuc/` dışına koymayın, git'e eklemeyin.

## Betikler
- `indir-hepsi.ps1` — tüm program/model dosyalarını indirir ve hash doğrular (şirket filtresi nedeniyle BT eliyle indirildi).
- `kos.ps1` — whisper-cli çalıştırır, süre ve tepe RAM ölçer. `wer.py` — WER, konuşmacı/rakam/isim hatası.
- `ayrim.ps1` — sherpa konuşmacı ayrımı (`-Segmentasyon` ile reverb-v1: önerilen). `birlestir.py` — ayrım etiketlerini Whisper satırlarına ekler. `ayrim_olc.py` — konuşmacı doğruluğu. `konusmaci.py` — profil tabanlı tanıma (`sina` / `profil` / `etiketle`).
- Gereken: ffmpeg ile `-ac 1 -ar 16000 -c:a pcm_s16le` wav. sherpa Türkçe harfli (ı, ş) yolları açamaz: wav'ı ASCII yola koyun.
- Çıktılar `sonuc/` altında; müşteri verisi içerdiği için `.gitignore`'da.

## Öneri
Üretimde: turbo-q5 + VAD (RAM dostu, en iyi uyum). Konuşmacı için eğitimsiz kümelemeyi isimlendirmede kullanmayın (Cemil/Yıldıray ayrışmıyor);
bilinen kişiler için `konusmaci.py profil` + `etiketle` (önceki Teams transkriptli toplantılardan profil, TitaNet small). Tanınmayanlar `?` kalır (`--esik`).
Güneş'e entegrasyonda transkripti işledikten sonra rakamları (tutar, tarih) kullanıcı onayına bırakın.
