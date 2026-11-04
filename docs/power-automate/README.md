# Güneş İstek akışı (Power Automate + OneDrive)

Graph uygulama kaydı ve claude.ai Microsoft 365 connector'ü olmadan Outlook, takvim ve Teams verisini Güneş'e taşımak için tek bir Power Automate akışı. Yalnızca standart bağlayıcılar kullanılır (Microsoft 365 lisansındaki Power Automate yeterli).

## Nasıl çalışır?

```
Güneş ──► OneDrive/Gunes/istek/<id>.json ──► "Güneş İstek" akışı tetiklenir
                                               │ Outlook / Takvim / Teams'ten okur
Güneş ◄── OneDrive/Gunes/cevap/<id>.json ◄─────┘   istek dosyası → Gunes/islenen/
```

- Güneş istek dosyasını bilgisayarındaki OneDrive klasörüne yazar; OneDrive senkronlar, akış tetiklenir.
- Akış cevabı `Gunes/cevap` klasörüne yazar; OneDrive bilgisayara indirir, Güneş okur.
- Tetikleyici "Klasörde dosya oluşturulduğunda" (OneDrive for Business). HTTP tetikleyicisi Premium olduğu için kullanılmaz.
- Bir tur ortalama 2–5 dakika sürer (senkron + tetikleyici yoklama aralığı).

## Klasörler (OneDrive'ın kökünde)

| Klasör | Kim yazar | İçerik |
|---|---|---|
| `Gunes/istek` | Güneş (testte siz) | İstek dosyaları |
| `Gunes/cevap` | Akış | Cevap dosyaları, istekle aynı ad |
| `Gunes/islenen` | Akış | İşlenmiş istek dosyaları (hata ayıklama için) |

Dosyalar **UTF-8, BOM'suz** JSON olmalı. Aynı dosyayı iki taraf asla düzenlemez; adlar benzersizdir.

## İstek türleri

| `tur` | Ne zaman | Akış ne yapar |
|---|---|---|
| `aralik` | Sabah taraması, 2 saatlik takip, ilk 45 günlük tarama (gün gün) | `bas`–`bit` arasındaki tüm mailleri (alt klasörler ve gönderilenler dahil), `takvimBas`–`takvimBit` arasındaki toplantıları ve isteğe bağlı Teams sohbet mesajlarını getirir |
| `ara` | Sohbette Güneş'in kendi kayıtlarında bulamadığı bir şey | Outlook'ta anahtar kelimeyle arar (en fazla 25 sonuç) |
| `devam` | Bir aralıkta 200'den fazla mail varsa | Önceki cevaptaki `mailDevam` bağlantısıyla sonraki sayfayı getirir |
| `taslak` | Sohbette taslak istendiğinde | Outlook'ta **taslak** oluşturur. Gönderme yoktur |

Örnekler: [`ornekler/`](ornekler/).

### İstek alanları

```jsonc
// aralik
{ "id": "20261104-0900-aralik", "tur": "aralik",
  "bas": "2026-11-04T07:00:00Z", "bit": "2026-11-04T09:00:00Z",          // mailler (UTC)
  "takvimBas": "2026-11-04T00:00:00Z", "takvimBit": "2026-11-07T00:00:00Z", // toplantılar
  "teams": true }
// ara
{ "id": "20261104-1012-ara", "tur": "ara", "kelime": "HGS mutabakat" }
// devam
{ "id": "20261104-0900-aralik-2", "tur": "devam", "link": "https://graph.microsoft.com/v1.0/me/messages?...&$skiptoken=..." }
// taslak (cevapla dolu ise o maile cevap taslağı, boş ise yeni taslak)
{ "id": "20261104-1020-taslak", "tur": "taslak", "cevapla": "", "kime": ["kaan@ornek.com"], "konu": "Ekim HGS farkları", "metin": "Merhaba Kaan Bey, ..." }
```

### Cevap

```jsonc
{ "id": "20261104-0900-aralik", "tur": "aralik", "durum": "tamam",   // ya da "hata"
  "mailler": [ /* Graph message nesneleri, olduğu gibi */ ],
  "mailDevam": null,                                             // 200'den fazlaysa sonraki sayfa bağlantısı
  "takvim": [ /* Graph event nesneleri */ ],
  "teams": [ { "sohbet": { /* chat */ }, "mesajlar": [ /* chatMessage */ ] } ],
  "taslak": null,                                                // taslak türünde oluşturulan taslağın id/webLink'i
  "hata": null }
```

Akış veriyi dönüştürmez; Graph'ın döndürdüğü diziler olduğu gibi yazılır, alan eşlemesini Güneş yapar. Bu sayede akışta döngü yoktur ve yüzlerce mail tek eylemde biter.

## Akışın yapısı

```
Tetikleyici: Dosya oluşturulduğunda (yalnızca özellikler) — /Gunes/istek
├─ Dosya_icerigi        Dosya içeriğini al (tetikleyicideki kimlikle)
├─ Istek                Oluştur: istek JSON'u
├─ Degisken Cevap       (Nesne) başlat
├─ Islem (Kapsam)
│   └─ Switch: Istek.tur
│       ├─ aralik:  Mail_HTTP → Takvim_HTTP → [teams=true ise Sohbetler_HTTP → döngü: Mesajlar_HTTP] → Cevap ayarla
│       ├─ ara:     Ara_HTTP → Cevap ayarla
│       ├─ devam:   Devam_HTTP → Cevap ayarla
│       ├─ taslak:  Taslak_HTTP (createReply ya da yeni mesaj) → Cevap ayarla
│       └─ varsayılan: Cevap = hata "bilinmeyen tur"
├─ Cevap_dosyasi        Dosya oluştur /Gunes/cevap/<id>.json           (Islem başarılıysa)
├─ Hata_dosyasi         Dosya oluştur /Gunes/cevap/<id>.json, durum=hata  (Islem başarısızsa)
└─ Istegi_tasi          İstek dosyasını /Gunes/islenen'e taşı          (her durumda)
```

Kurulum için kopyalanabilir tarif: [`claude-in-chrome-prompt.md`](claude-in-chrome-prompt.md). Elle kurulacaksa da aynı adımlar geçerli.

## Güvenlik kuralları

- Akışta **"E-posta gönder"** eylemi ve Graph'ın `/send` uç noktası **yoktur**. Taslak türü yalnızca taslak oluşturur.
- Mail silme, taşıma, takvim değiştirme, Teams'e mesaj gönderme yoktur. HTTP eylemleri yalnızca `GET`, taslak için de yalnızca `POST /me/messages` ve `POST /me/messages/{id}/createReply` kullanılır.
- Akış yalnızca kendi hesabınızın verisini okur.

## Test planı (Güneş olmadan, herhangi bir bilgisayarda)

1. Akışı kurun ve kaydedin.
2. Bir test isteği bırakın. İki yol var:
   - OneDrive web'de `Gunes/istek` klasörüne `ornekler/aralik.json`'u yükleyin (önce tarihleri dünün tarihine çevirin), ya da
   - OneDrive masaüstü uygulaması kuruluysa: `powershell -ExecutionPolicy Bypass -File scripts\power-automate\istek-olustur.ps1 -Tur aralik -Saat 24`
3. 1–5 dakika bekleyin; Power Automate'te çalışma geçmişine ve `Gunes/cevap` klasörüne bakın.
4. Sırayla deneyin:

| Test | Beklenen |
|---|---|
| `aralik`, son 24 saat | `mailler`, `takvim` dolu, `durum: tamam` |
| `aralik`, `teams: true` | `teams` dizisi dolu (Teams eylemi kiracıda açıksa) |
| `ara`, bildiğiniz bir kelime | `mailler` içinde ilgili mail |
| `taslak`, kendinize | Outlook'ta **Taslaklar** klasöründe yeni taslak; gönderilmiş olmamalı |
| Bozuk JSON (`ornekler/hatali.json`) | `cevap` klasöründe `durum: hata` |
| `aralik`, 3 günlük | Süre ve dosya boyutu not edilir (45 günlük tarama tahmini için) |

5. Sonuçları (çalışma süreleri, hata varsa mesajı, cevap dosyası örneği) not edin; Güneş'in klasör modu bu dosya biçimine göre yazılacak.

## Bilinen belirsizlikler

- Outlook ve Teams bağlayıcılarındaki "HTTP isteği gönder" eylemleri bazı kiracılarda önizleme ya da yönetici tarafından kapalı olabilir. O durumda yedek: Outlook "E-postaları al (V3)" (tarih filtresiyle, gün gün) ve "Etkinlikleri al (V4)".
- Teams sohbet geçmişi: kişisel ve grup sohbetlerinin mesajlarını okuma izni bağlayıcıda sınırlı olabilir. Çalışmazsa Teams şimdilik dışarıda kalır.
- Şirketin Power Automate veri kaybı önleme (DLP) politikası OneDrive ile Outlook'u aynı akışta engelliyorsa akış kaydedilmez.
