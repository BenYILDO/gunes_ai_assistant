# LinkedIn yazısı 2 — taslak

> Not: Önceki yazının tam metnine erişemedim; bu taslak "toplantılar" döneminden (9–10 Kasım) başlıyor. Yazıya "geçen yazıdan beri" diye girdim. Müşteri/kişi adı, ekran görüntüsü ve ses örneği içermiyor; paylaşmadan önce kendi ekran görüntülerini kontrol et.

## Ana metin (≈ 1.900 karakter)

Geçen yazımdan beri Güneş'in başına neler geldi, kısaca anlatayım. ☀️

Güneş, Outlook ve Teams'imi takip eden, kanban panomu tutan, hafızası olan kişisel asistanım. API anahtarı yok; bilgisayardaki Claude Code'u (üyeliğimi) çalıştırıyor. Bu hafta onu "okuyan"dan "toplantıya eşlik eden" bir asistana çevirdim.

🎙️ Toplantıyı kendi başına dinler, ama sormadan değil
Teams araması çalarken "bu aramaya katılayım mı?" diye sorar. Takvimdeki toplantıya 1 dakika kala da sorar. Evet demeden tek bir saniye kaydetmez; cevap vermezsem kaydı siler. Güneş toplantıya giren bir bot değil: sesi benim bilgisayarımda yakalıyor.

📝 Yerelde yazıya döker
Transkript whisper.cpp ile makinemde üretiliyor, ses dışarı çıkmıyor. Ölçtüm: 20 dakikalık Türkçe toplantı yaklaşık gerçek zamanda çözülüyor, Teams'in kendi transkriptine göre fark %30. Rakamlarda hâlâ zayıf; o yüzden düzeltme katmanı rakamlara dokunmuyor.

🗣️ Kimin ne dediğini bilir
Ses parmak izleriyle konuşmacıları tanır, benim sesimi mikrofon kanalından kendisi ayırır. Tanıyamadığı sesleri bir kez adlandırınca hatırlar; iki sese aynı adı verirsem tek kişide birleştirir. Ses profilleri kişisel veri: kişi başı silinebiliyor, ses dosyası buluta gitmiyor.

✅ Toplantıdan sonra iş çıkarır, ama onaysız hiçbir şey yapmaz
Özet, karar, aksiyon ve "şu kartı aç, şunu hafızana yaz" önerileri çıkarıyor. Hepsi benim onayımla uygulanıyor. Takip maili de hazırlıyor ama göndermiyor, yalnızca metin veriyor. Güneş hiçbir zaman mail ya da mesaj göndermiyor; bu kural kodda ve testte sabit.

💬 Ve en son: incelemeyi sohbetle yürütüyorum
"İnceleme bekliyor" ekranındaki adımları artık Güneş'e yazarak ilerletiyorum: yanlış duyulan satırı düzeltiyor, 5 ses çıkmış toplantıyı 3 kişiye indirmeme yardım ediyor, özeti yeniliyor, önerileri tek tek anlatıyor.

Bunların yanında günlük kullanım için "Bugün" ekranı (sıradaki toplantı + hazırlık notu), önem sırasına göre gelen kutusu, sessiz saatler ve — evet — isteğe bağlı bir evcil kedi (varsayılan kapalı, ceza yok, puanı sadece ben iş bitirince kazanıyor 🐱).

Rakamlar: 9 Kasım'dan bu yana yaklaşık 100 dosya, +12 bin satır, 200 otomatik test. Testlerin önemli kısmı güvenlik kuralları için: ajan kartı kapatamaz, mail gönderemez, onaysız öneri uygulanamaz.

En çok öğrendiğim şey: yapay zekâ asistanını güçlü yapan, ona daha çok yetki vermek değil; neyi asla yapamayacağını kodla sabitlemek. Sınır net olunca ona daha çok güvenip daha çok iş bırakabiliyorum.

Siz toplantı sonrası işlerinizi nasıl yönetiyorsunuz?

#YapayZeka #Claude #KişiselAsistan #Verimlilik #Lojistik #Türkiye

---

## Kısa sürüm (≈ 700 karakter)

Güneş'e bu hafta toplantı ayağı ekledim ☀️

Teams araması çalarken "katılayım mı?" diye sorar, evet demeden kaydetmez. Transkript makinemde (whisper.cpp), ses dışarı çıkmıyor. Konuşmacıları tanır, aynı adı verdiğim sesleri birleştirir. Toplantı sonrası özet, karar ve aksiyon önerir; hepsi benim onayımla uygulanır. Takip mailini hazırlar ama göndermez.

Son eklenen: incelemeyi sohbetle yürütmek. "Bu satır yanlış duyulmuş, şöyle düzelt" demek yeterli.

100 dosya, +12 bin satır, 200 test. Asıl ders: asistanı güçlü yapan daha çok yetki değil, yapamayacaklarını kodla sabitlemek.

#YapayZeka #Claude #Verimlilik

---

## Görsel önerileri (paylaşmadan önce kendin çek; kişi/müşteri adı görünmesin)
1. Windows popup'ı: "Bu aramaya katılayım mı?" (sağ alt küçük pencere).
2. Toplantı inceleme sihirbazı: Sesler → Özet ve kararlar → Öneriler → Bitir adımları.
3. Sohbette "Toplantı" rozeti + Güneş'in düzeltme yaptığı mesaj (demo verisiyle: `npm run demo`).
4. Bugün ekranı (sıradaki toplantı + hazırlık notu).
5. İsteğe bağlı: kedinin Pano kartında yattığı kısa ekran kaydı.

## Paylaşmadan önce kontrol
- Kurumsal paylaşım/gizlilik politikası: "Alişan Lojistik" adı ve gerçek toplantı içerikleri görünmesin.
- Sohbetle inceleme birim testleriyle doğrulandı, gerçek bir toplantıda uçtan uca denenmedi: yazıdan önce bir kez dene ya da o paragrafı "yeni eklendi" diye yumuşat.
- %30 farkı "Teams'in kendi transkriptine kıyasla uyuşmazlık" diye anlatıyorum; mutlak doğruluk iddiası değil.
