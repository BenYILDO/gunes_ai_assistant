# Claude in Chrome için kurulum promptu

Aşağıdaki metni olduğu gibi Claude in Chrome'a yapıştırın. Şirket hesabınızla Power Automate'e ve OneDrive'a giriş yapmış olmanız yeterli; bağlantı izni pencereleri çıkarsa onları siz onaylayın.

---

```text
Benim için Power Automate'te "Güneş İstek" adında bir bulut akışı kurmanı istiyorum. Akış, OneDrive'daki bir klasöre bırakılan JSON istek dosyalarını okuyup Outlook, takvim ve Teams'ten veri çekecek ve cevabı yine OneDrive'a JSON olarak yazacak. Adımları aşağıda tam olarak tarif ettim; eylem adlarını AYNEN kullan, çünkü ifadeler bu adlara başvuruyor.

GÜVENLİK KURALLARI (kesin):
- Akışa "E-posta gönder", "E-postayı ilet", "Yanıtla" gibi gönderen hiçbir eylem ekleme. Graph'ın /send uç noktasını hiçbir yerde kullanma.
- Mail silme/taşıma, takvim değiştirme, Teams'e mesaj gönderme eylemi ekleme. HTTP eylemlerinde yalnızca GET kullan; tek istisna taslak dalındaki iki POST (/me/messages ve /me/messages/{id}/createReply).
- Benim diğer akışlarıma dokunma. Yalnızca make.powerautomate.com ve OneDrive web sayfalarında çalış.
- Giriş ya da bağlantı izni (connection consent) penceresi çıkarsa dur ve benim onaylamamı iste.
- Emin olmadığın bir eylem adı ya da seçenek çıkarsa tahmin etme; bana ne gördüğünü söyle.

ÖN HAZIRLIK
1. OneDrive (iş hesabı) web'de kökte "Gunes" klasörü ve içinde "istek", "cevap", "islenen" klasörlerini oluştur (varsa dokunma).

AKIŞ (Otomatik bulut akışı, adı: Güneş İstek)

2. Tetikleyici: OneDrive for Business → "Dosya oluşturulduğunda (yalnızca özellikler)" / "When a file is created (properties only)". Klasör: /Gunes/istek. Alt klasörleri dahil etme.

3. Üst seviyede iki değişken başlat:
   - Ad: Cevap, Tür: Nesne (Object), Değer: {}
   - Ad: TeamsListe, Tür: Dizi (Array), Değer: []

4. "Kapsam" (Scope) ekle, adı: Islem. Aşağıdakilerin hepsi bu kapsamın İÇİNE:

   4a. OneDrive for Business → "Dosya içeriğini al" (Get file content). Adı: Dosya_icerigi. Dosya: tetikleyicinin "Kimlik/Id" değeri.

   4b. "Oluştur" (Compose), adı: Istek. Girdi ifadesi:
       json(base64ToString(body('Dosya_icerigi')?['$content']))
       Not: İlk test çalışmasında Dosya_icerigi çıktısına bak. Çıktı zaten bir JSON nesnesiyse ifadeyi body('Dosya_icerigi') yap; düz metinse json(body('Dosya_icerigi')) yap. Hangisini seçtiğini bana söyle.

   4c. "Anahtar" (Switch), adı: Tur_secimi. Açık: outputs('Istek')?['tur']
       Dört durum ekle: aralik, ara, devam, taslak. Varsayılan dal da olacak.

   DURUM "aralik":
     i.  Office 365 Outlook → "HTTP isteği gönder" / "Send an HTTP request". Adı: Mail_HTTP.
         Yöntem: GET
         URI: https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge @{outputs('Istek')?['bas']} and receivedDateTime lt @{outputs('Istek')?['bit']}&$orderby=receivedDateTime&$top=200&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,body,importance,webLink,parentFolderId,isDraft,hasAttachments
         Üst bilgi (header): Prefer = outlook.body-content-type="text"
         (Boşluklar yüzünden 400 hatası alırsan boşlukları %20 yap.)
     ii. Office 365 Outlook → "HTTP isteği gönder". Adı: Takvim_HTTP.
         Yöntem: GET
         URI: https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=@{outputs('Istek')?['takvimBas']}&endDateTime=@{outputs('Istek')?['takvimBit']}&$top=200&$select=id,subject,start,end,location,organizer,attendees,isCancelled,isAllDay,isOnlineMeeting,onlineMeeting,webLink,bodyPreview
     iii. "Koşul" (Condition), adı: Teams_istendi_mi. Sol: outputs('Istek')?['teams']  eşittir  Sağ: true (ifade olarak true)
          EVET dalı:
            - Microsoft Teams → "Microsoft Graph HTTP isteği gönder" / "Send a Microsoft Graph HTTP request". Adı: Sohbetler_HTTP. GET
              URI: https://graph.microsoft.com/v1.0/me/chats?$expand=lastMessagePreview&$top=50
            - "Diziyi filtrele" (Filter array), adı: Aktif_sohbetler. Kaynak: body('Sohbetler_HTTP')?['value']
              Gelişmiş modda koşul:
              @greaterOrEquals(ticks(coalesce(item()?['lastMessagePreview']?['createdDateTime'], '1900-01-01T00:00:00Z')), ticks(outputs('Istek')?['bas']))
            - "Her biri için uygula" (Apply to each), adı: Her_sohbet. Kaynak: body('Aktif_sohbetler'). Eşzamanlılık KAPALI (sırayla).
                - Microsoft Teams → "Microsoft Graph HTTP isteği gönder", adı: Mesajlar_HTTP. GET
                  URI: https://graph.microsoft.com/v1.0/chats/@{items('Her_sohbet')?['id']}/messages?$top=50
                - "Dizi değişkenine ekle" (Append to array variable): TeamsListe, değer:
                  {"sohbet": {"id": "@{items('Her_sohbet')?['id']}", "konu": "@{items('Her_sohbet')?['topic']}", "tur": "@{items('Her_sohbet')?['chatType']}"}, "mesajlar": @{body('Mesajlar_HTTP')?['value']}}
                  ("mesajlar" dizisini tırnaksız, dinamik ifade belirteci olarak ekle; tipi dizi kalmalı. Aşağıda iv'teki ÖNEMLİ notuna bak.)
          HAYIR dalı: boş.
     iv. "Değişkeni ayarla" (Set variable): Cevap. Değer (JSON; ifadeleri tırnaksız dinamik ifade olarak ekle):
         {
           "id": "@{outputs('Istek')?['id']}",
           "tur": "aralik",
           "durum": "tamam",
           "mailler": @{body('Mail_HTTP')?['value']},
           "mailDevam": @{body('Mail_HTTP')?['@odata.nextLink']},
           "takvim": @{body('Takvim_HTTP')?['value']},
           "teams": @{variables('TeamsListe')},
           "taslak": null,
           "hata": null
         }
         ÖNEMLİ: Dizileri (mailler, takvim, teams) ve mailDevam'ı tırnaksız, dinamik ifade belirteci olarak ekle; tipleri korunmalı. Kod görünümünde "mailler": "@body('Mail_HTTP')?['value']" biçiminde (tek ifade) görünmeli; "@{...}" biçimi metne çevirir. Aşağıdaki diğer "Değişkeni ayarla" adımlarında da aynı kural geçerli. Test çıktısında mailler dizi değil de tırnaklı metin olarak görünürse bana söyle. Bir değer boşsa null olabilir, sorun değil.

   DURUM "ara":
     i.  Office 365 Outlook → "HTTP isteği gönder", adı: Ara_HTTP. GET
         URI: https://graph.microsoft.com/v1.0/me/messages?$search="@{outputs('Istek')?['kelime']}"&$top=25&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,body,importance,webLink,parentFolderId
         Üst bilgi: Prefer = outlook.body-content-type="text"
     ii. Değişkeni ayarla Cevap:
         {"id": "@{outputs('Istek')?['id']}", "tur": "ara", "durum": "tamam", "mailler": @{body('Ara_HTTP')?['value']}, "mailDevam": null, "takvim": [], "teams": [], "taslak": null, "hata": null}

   DURUM "devam":
     i.  Office 365 Outlook → "HTTP isteği gönder", adı: Devam_HTTP. GET
         URI: @{outputs('Istek')?['link']}
         Üst bilgi: Prefer = outlook.body-content-type="text"
     ii. Değişkeni ayarla Cevap:
         {"id": "@{outputs('Istek')?['id']}", "tur": "devam", "durum": "tamam", "mailler": @{body('Devam_HTTP')?['value']}, "mailDevam": @{body('Devam_HTTP')?['@odata.nextLink']}, "takvim": [], "teams": [], "taslak": null, "hata": null}

   DURUM "taslak":
     i.  Koşul, adı: Yeni_taslak_mi. empty(outputs('Istek')?['cevapla']) eşittir true
         EVET dalı:
           - "Seç" (Select), adı: Alicilar. Kaynak: outputs('Istek')?['kime']. Eşleme (metin modu): {"emailAddress": {"address": "@{item()}"}}
           - Office 365 Outlook → "HTTP isteği gönder", adı: Taslak_Yeni_HTTP. Yöntem: POST
             URI: https://graph.microsoft.com/v1.0/me/messages
             Gövde: {"subject": "@{outputs('Istek')?['konu']}", "body": {"contentType": "Text", "content": "@{outputs('Istek')?['metin']}"}, "toRecipients": @{body('Alicilar')}}
             Üst bilgi: Content-Type = application/json
         HAYIR dalı:
           - Office 365 Outlook → "HTTP isteği gönder", adı: Taslak_Cevap_HTTP. Yöntem: POST
             URI: https://graph.microsoft.com/v1.0/me/messages/@{outputs('Istek')?['cevapla']}/createReply
             Gövde: {"comment": "@{outputs('Istek')?['metin']}"}
             Üst bilgi: Content-Type = application/json
         (İkisi de yalnızca TASLAK oluşturur. Gönder eylemi ekleme.)
     ii. Değişkeni ayarla Cevap:
         {"id": "@{outputs('Istek')?['id']}", "tur": "taslak", "durum": "tamam", "mailler": [], "mailDevam": null, "takvim": [], "teams": [], "taslak": @{coalesce(body('Taslak_Yeni_HTTP'), body('Taslak_Cevap_HTTP'))}, "hata": null}
         Not: Koşulun yalnızca bir dalı çalışacağı için diğer eylem "atlandı" olur; bu ayar eylemi koşuldan SONRA ve koşulun dışında olmalı.

   VARSAYILAN dal:
     Değişkeni ayarla Cevap:
     {"id": "@{outputs('Istek')?['id']}", "durum": "hata", "hata": "bilinmeyen tur: @{outputs('Istek')?['tur']}"}

5. Kapsamın DIŞINDA, Islem'den sonra sırayla:
   5a. OneDrive for Business → "Dosya oluştur", adı: Cevap_dosyasi.
       Klasör: /Gunes/cevap, Dosya adı: @{triggerBody()?['NameNoExt']}.json
       İçerik: @{string(variables('Cevap'))}
       "Sonra çalıştır" (Run after) ayarı: Islem → başarılı.
       (Tetikleyicide NameNoExt alanı yoksa dosya adını tetikleyicinin "Ad" alanından uzantısız al ve bana söyle.)
   5b. OneDrive for Business → "Dosya oluştur", adı: Hata_dosyasi.
       Klasör: /Gunes/cevap, Dosya adı: @{triggerBody()?['NameNoExt']}.json
       İçerik: {"id": "@{triggerBody()?['NameNoExt']}", "durum": "hata", "hata": @{string(result('Islem'))}}
       (result('Islem') bir dizi döndürür; string() onu JSON metnine çevirir, bu yüzden "hata" değeri tırnaksız kalmalı ve dosya geçerli JSON olur. Dosya içeriği burada düz metin olduğu için @{ } kullanımı doğrudur.)
       Sonra çalıştır: Cevap_dosyasi → atlandı VE başarısız oldu (ikisi de işaretli).
   5c. OneDrive for Business → "Dosyayı taşı veya yeniden adlandır" (Move or rename a file), adı: Istegi_tasi.
       Dosya: tetikleyicinin Kimlik/Id değeri. Hedef yol: /Gunes/islenen/@{triggerBody()?['Name']}. Üzerine yaz: Evet.
       Sonra çalıştır: Hata_dosyasi → başarılı, başarısız oldu, atlandı (üçü de işaretli).

6. Kaydet. Hata çıkarsa düzelt ve bana neyi değiştirdiğini söyle. Tetikleyicinin eşzamanlılık ayarına dokunma (bir kez açılınca kapatılamıyor).

TEST
7. Bilgisayarımda bir metin dosyası oluşturamıyorsan OneDrive web'de /Gunes/istek klasörüne "Yeni → Metin belgesi" ile test-aralik.json adında bir dosya oluştur, içine şunu yaz (tarihleri dün ve bugün olacak şekilde UTC olarak güncelle):
   {"id":"test-aralik","tur":"aralik","bas":"2026-11-03T00:00:00Z","bit":"2026-11-04T00:00:00Z","takvimBas":"2026-11-03T00:00:00Z","takvimBit":"2026-11-06T00:00:00Z","teams":true}
   Dosyayı kaydet. Yeni belge oluşturma OneDrive web'de .txt yaratıyorsa adını test-aralik.json yap.
8. 1–5 dakika bekle. Akışın çalışma geçmişini aç. Başarılıysa /Gunes/cevap/test-aralik.json dosyasının oluştuğunu ve /Gunes/istek'teki dosyanın /Gunes/islenen'e taşındığını kontrol et. Hata varsa hangi eylemde, hangi mesajla hata verdiğini bana yaz; Teams eylemi hata verirse Teams kısmını kaldırmadan önce bana sor.
9. Son olarak bana şunları raporla: akışın kaydedildiği, test sonucunun ne olduğu, cevap dosyasında kaç mail ve kaç toplantı geldiği, 4b'de hangi ifadeyi seçtiğin ve beklediğim dışında yaptığın her değişiklik.
```

---

## Claude in Chrome'u kullanırken

- Claude in Chrome kendi tarayıcınızda, sizin oturumunuzla çalışır. Bağlantı izni pencerelerini (Outlook, Teams, OneDrive bağlantıları) siz onaylayın.
- Eylem adları Türkçe arayüzde biraz farklı çıkabilir. Promptta hem Türkçe hem İngilizce karşılıklar var.
- Kurulum bittikten sonra diğer testleri `README.md`'deki test planına göre yapın.
