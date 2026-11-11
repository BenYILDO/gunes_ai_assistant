# Kararlar, ölçülmüş sınırlar, tuzaklar

## Kararlar (neden böyle)
| Karar | Neden |
|---|---|
| API anahtarı yok, `claude` CLI | Kullanıcının mevcut üyeliği; maliyet/anahtar yönetimi yok |
| Panoya yazma yalnız MCP'den | Şema + güvenlik kuralları tek yerde, test edilebilir |
| Transkript **yerel** (whisper.cpp) | Müşteri/toplantı sesi dışarı çıkmasın; kuruma uygunluk |
| Ses profili Supabase'de, ses dosyası yerelde | Profil taşınabilir; ses ve biyometrik risk yerelde kalsın; kişi başı silme (KVKK) |
| Takvim katılımcılarına göre sınırlı profil kümesi | Daha az yanlış eşleşme; eşik 0,40 |
| Mikrofon kayıt defteri izi (arama algılama) | Teams/Zoom'un iç API'sine bağımlı olmadan "mikrofon açıldı" sinyali |
| Katıl demeden kayıt yok; cevapsızsa at ve sil | Gizlilik; yanlış kayıt riski |
| WASAPI loopback (her aktif çıkış) | Ekran paylaşımı/izin penceresi olmadan karşı tarafı yakalar; stereo kanal → "kendi ses" |
| Haiku iyileştirme rakamlara dokunmaz | Whisper rakamlarda zayıf (9/13 hata); model tahmini yanıltıcı olur |
| Öneri/uygulama her zaman kullanıcı onaylı | Ajan kendi başına kart/hafıza değiştirmesin |
| Pet varsayılan kapalı, ceza yok | İş aracı; kullanıcı isterse açar; stres yaratmaz |
| Sohbet toplantı araçları chat-only | Zamanlanmış ajanlar toplantıyı değiştiremesin |
| Aynı ad = aynı kişi (profil birleşir) | Kullanıcı elle aynı adı yazarsa aynı yerde toplanma beklentisi |

## Ölçümler (kaynak `scripts/whisper/RAPOR.md`)
Kayıt: Teams, 20 dk 21 sn, 3 konuşmacı, Türkçe; Intel Core Ultra 5 235U, 31 GB RAM, GPU yok.
- **Seçilen**: `ggml-large-v3-turbo-q5_0` + Silero VAD + greedy (`-bs 1 -bo 1`), 12 iş parçacığı → **WER %30,4, 1,01× gerçek zaman, 1,0 GB RAM**.
- Beam 5: %30,2 ama 0,62×; `large-v3`: 0,37×, turbo'dan doğru değil; `--prompt`/`--max-context 0`/beam 8 kazandırmadı.
- **Rakam hatası 9/13** → tutar/fatura numaralarına güvenme (iyileştirme katmanı rakama dokunmaz).
- WER referansı Teams'in kendi otomatik transkripti → mutlak doğruluk değil, iki sistemin uyuşmazlığı; Whisper çoğu yerde Teams'ten iyiydi.

## Bilinen sınırlar
- Kendi sesini otomatik etiketleme yalnız **yerel stereo yakalamada**; tek kanallı yüklemede yok.
- Teams çalma penceresi imzası (başlık "Microsoft Teams", ≈372×88) gerçek günlükten; sürümle değişebilir.
- Mikrofon seçimi "en yüksek konuşma seviyesi" sezgisi; çok mikrofonlu sistemlerde `GUNES_MIC_DEVICE` ile sabitle.
- `events.ends_at` yoksa (eski veri) toplantı 60 dk sayılır.
- Sohbet toplantı araçları gerçek CLI ile uçtan uca denenmedi.

## Tuzaklar (Windows/araçlar)
- PowerShell betikleri **UTF-8 BOM** ile; `.vbs` yalnız ASCII.
- Uzun içerik CLI'a argüman değil **stdin** (komut satırı sınırı).
- Test dosyaları `import './env.js'` ile başlamalı.
- Host testinde `fetch` Host başlığını değiştiremez → ham `http.request`.
- `package-lock` `engines` ile `package.json` uyumlu tutulmalı (CI).
- Git Bash'te çok satırlı Türkçe/kesme işaretli heredoc kırılır → dosyayı Write ile yaz.
- Kullanıcı verisi (müşteri adları, ses) git'e girmez; `data/` yok sayılır.

## Yapılmayanlar / fikirler
Sesli komutlar ("Güneş, katıl") ertelendi · Faz 3 araştırmacı (rakip/sektör radarı) `docs/PLAN.md` · pet 3. aşama (fikir aşamasında).
