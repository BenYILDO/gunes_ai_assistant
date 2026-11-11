# Toplantılar (`server/src/meetings/`, `web/src/components/MeetingsView.tsx`)

Güneş toplantıya katılan bir **bot değildir**: kullanıcının kendi bilgisayarındaki sesi yerelde yakalar. Hiçbir şey kullanıcı "Katıl" demeden kaydedilmez. Kayıt/dinleme kurum politikasına uygun yapılmalıdır.

## 0. Uçtan uca akış
```
arama/takvim algıla → (popup: Katıl?) → arayanı oku → ses yakala → ffmpeg → whisper.cpp → [Haiku iyileştirme]
→ konuşmacı gömme (sherpa-onnx) → profil eşleştirme → bilinmeyenleri kümele → panelde/sohbette isimlendir
→ Sonnet analiz (özet+karar+aksiyon+ÖNERİLER) → kullanıcı Uygula/Geç → finalize (wiki + proje satırı + thread link)
```
Durumlar: `recording → queued → processing → review → done` (+ hata). `STATUS_TR` etiketleri `review.ts`'de.

## 1. Kayıt kaynakları
- **Yükleme/klasör**: mp4/ses; `GUNES_RECORDINGS_DIR` klasöründen seçme. `api.ts` (`/api/meetings`), `tools.ts` (ffmpeg/whisper yolları, `GUNES_WHISPER_DIR`).
- **Tarayıcıdan canlı dinleme** (eski yöntem): ekran paylaşımı sistem sesi + mikrofon → `web/src/lib/liveCapture.ts`, `LivePill.tsx`. `GUNES_NATIVE_CAPTURE=off` buna döner.
- **Yerel yakalama** (varsayılan): `capture.ts` + `scripts/windows/ses-yakala.ps1` — PowerShell içinde derlenen küçük C# (WASAPI): mikrofon + **her aktif çıkış cihazının loopback'i** → ham PCM. İzin/ekran paylaşımı penceresi yok. Durunca ffmpeg ile **stereo `capture.wav`** (sol=mikrofon, sağ=karşı taraf). `recoverRecordings` sunucu yeniden başlarsa ham sesi toparlar. **Mikrofon otomatik seçimi**: `-Mic` yoksa her aktif mikrofon ayrı `mic-N.raw`; bitince en yüksek konuşma seviyeli seçilir (`pickMic`, `speechLevel`); Stereo Mix atlanır; `GUNES_MIC_DEVICE` sabitler.

## 2. Arama algılama (`callwatch.ts`, `ringwatch.ts`, `ringlog.ts`)
- **Mikrofon izi**: Windows `ConsentStore\microphone` kaydı 4 sn'de bir okunur (`parseConsentStore`, `readMicEntries`); `LastUsedTimeStop=0` = mikrofon kullanımda → Teams/Zoom vb. algılanır (`activeCallApps`, `appLabel`). Takvimle eşleşirse toplantı adı (`matchEvent`), yoksa "plansız arama".
- **Çalarken sorma** (`ringwatch.ts` + `scripts/windows/pencere-izle.ps1`): Teams arama GELİRKEN başlığı tam "Microsoft Teams" olan küçük (~372×88) bildirim penceresi açar (gerçek günlükten öğrenildi); izleyici 0,5 sn'de yakalar, Güneş cevaptan ÖNCE sorar. Cevaplanmazsa kayıt **atılır ve silinir**; cevaplanırsa oturum mikrofon-tabanlı aramaya devredilir (`adoptRing`, `RING_CONFIRM_MS`).
- **Takvimden önceden sorma** (`nextPlanned`, `GUNES_PRECALL_LEAD_SEC`=60): toplantıya 1 dk kala "katılayım mı?". Katıl → dinleme hemen (`planned`); başlangıçtan 15 dk sonra mikrofon açılmadıysa kayıt atılır. Odak/öğle/izin vb. ve 5 dk–4 saat dışı kayıtlar sorulmaz; toplantı başına bir kez.
- Durum makinesi: `stepCall`, `IDLE`; `callWatcher.joinNative` "Katıl"ı işler.

## 3. Windows popup'ı (`callpopup.ts` + `scripts/windows/arama-penceresi.ps1`)
Sağ altta, Güneş penceresinden bağımsız küçük pencere; `WS_EX_NOACTIVATE` (Teams'ten odağı almaz). "Katıl" sunucuya satır yazar (`parsePopupLine`) → `joinNative`: önce arayanı okur, sonra yerel dinlemeyi başlatır (tarayıcı gerekmez). **Yanlış tıklama koruması**: fare tıklaması, imleç düğme üzerinde hareket ettikten sonra sayılır (popup imlecin altında açılırsa oradan gelen tıklama "Katıl"a düşmesin) — **kaldırma**. Popup açıkken tarayıcı popup'ı (`CallPrompt.tsx`) gizlenir; durum `web/src/lib/callState.ts`.

## 4. Arayanı tanıma (`callid.ts`, `scripts/windows/pencere-goruntusu.ps1`)
"Katıl" anında arama uygulamasının **en üstteki penceresi** (tüm ekran değil) `PrintWindow` ile alınır → `runClaude({images})` (stream-json, **araçsız** model) isimleri/başlığı okur (`buildIdentifyPrompt`, `parseIdentity`). Görüntüdeki talimatlar uygulanmaz; görüntü **her durumda silinir**, DB'ye girmez; sonuç katılımcılara/başlığa işlenir. `GUNES_CALL_SCREENSHOT=off` kapatır.

## 5. Transkript ve iyileştirme
- `pipeline.ts` (`processMeeting`, `enqueue` sıra, `recoverStaleMeetings`): ffmpeg → `whisper-cli` (turbo-q5 + VAD + greedy) → `parseVtt`.
- **Haiku bağlam iyileştirme** (`refine.ts`): transkript hemen görünür; arkada Haiku özel isim/terimleri düzeltir (`buildGlossary` takvim/wiki/hafızadan sözlük çıkarır). **Rakamlara dokunmaz** (`digitRuns` doğrular, `acceptRefinement` sınırlar); özgün metin satırın `raw` alanında. `GUNES_REFINE`.
- Ses dosyaları `GUNES_AUDIO_RETENTION_DAYS` (30) gün sonra silinir (`retention.ts`); klasörden seçilen özgün dosyalara dokunulmaz.

## 6. Konuşmacı tanıma (`voices.ts`, `channels.ts`, `scripts/whisper/konusmaci.py`)
1. `konusmaci.py gomme`: sherpa-onnx **TitaNet** vektörleri.
2. `candidateProfiles`: yalnızca **takvim katılımcılarına** göre sınırlı profil kümesi; `recognize` eşik **0,40** (`GUNES_VOICE_THRESHOLD`), `cosine`.
3. Tanınmayanlar `clusterUnknown` (çekirdek tabanlı gruplama) → "Bilinmeyen ses N".
4. **Kendi sesiniz** (`channels.ts`): stereo `capture.wav`'da her satırın iki kanaldaki enerjisine bakılır (`classifyLevels`, `USER_RATIO`/`REMOTE_RATIO`); mikrofon baskınsa = siz → profile sorulmadan tam adınızla (`ownLabel`) etiketlenir, kümelemeye girmez. Karşı taraf kanalındaki satır profil sizi söylese bile size verilmez. Belirsiz (`both`) satırlar profile kalır. **Yalnız `capture.wav`**; tek kanallı yüklemede kanal bilgisi yok.
5. **İsimlendirme** (`pipeline.ts` → `nameSpeaker`): tek tıkla ya da sohbetten. **Aynı ad = aynı kişi**: `sameName` (büyük/küçük, aksan duyarsız, `foldName`) ile profiller birleşir, vektör ağırlıklı `centroid` olur, tek konuşmacı/tek profil kalır (`summarizeSpeakers`). İki ayrı sese elle "Evin Akdağ" yazılırsa tek yerde toplanır (örnek sayısı 2) — `server/test/review.test.ts` doğrular.
6. **`cleanPersonName`**: "(Ben)", "[Ben kendim]", "(me)" gibi işaretler addan temizlenir; tek sözcük kalıp kullanıcının adıysa tam ad olur (`GUNES_USER_NAME`). Kullanıcı kendi sesini "Yıldıray Sürmen (Ben)" yazıyordu; eski profil `sameName` ile eşleşir, görünüm temiz.
7. `relabelSpeaker`: bir konuşmacının tüm satırlarını başka ada çevirir.
8. **Ses profilleri biyometrik veridir (KVKK)**: kişi başı silinebilir; ses dosyası Supabase'e **gitmez** (yalnız `data/meetings/`).

## 7. Analiz ve toplantı sonrası Güneş (`proposals.ts`, migration 0007)
`analyzeMeeting` (Sonnet): özet, konular, kararlar, aksiyonlar + **öneriler** (`remember`, kart, wiki, `followup_mail`…; `MAX_PROPOSALS`; `validateProposals`). Kullanıcıya sohbette sorulur (`nudgeMessage`), panelde **Uygula/Geç**. Kurallar: onaysız uygulanmaz; kart `done` olamaz; `soul`/`soul_core` hafızası önerilemez. **`followup_mail`**: alıcılar yalnızca toplantı katılımcılarından; uygulanınca SADECE metin üretir (`followupDraft`, modelsiz) — **mail gönderilmez, Outlook'a taslak bile yazılmaz**; arayüzde kopyalanır. `applyAllProposals` toplu uygulama. `finalizeMeeting`: wiki sayfası (`buildWikiPage`) + proje sayfasına satır + takvim olayı için thread link; puan verir (pet).

## 8. Sohbetle inceleme (en son özellik, `4005da2`)
Kullanıcı "inceleme bekliyor" adımlarını **Güneş sohbetinden** ilerletebilir.
- **Araçlar** (`mcp.ts`, tümü `MEETING_CHAT_TOOLS` ⊂ `chatOnly`; ajan/araştırmacı çağıramaz): `list_meetings`, `read_meeting` (overview|transcript, from_index, limit), `meeting_name_speaker`, `meeting_relabel`, `meeting_edit_lines`, `meeting_analyze` (6 dk zaman aşımı), `meeting_apply_proposal` (**`user_confirmed: z.literal(true)` şart**, yalnız kullanıcı açıkça isterse), `meeting_skip_proposal`, `meeting_finalize`.
- Araçlar ana sunucunun yerel HTTP API'sini çağırır (`gunesApi`, Origin başlığı yok → `originGuard` geçer); toplantı 8 karakterlik önekle bulunur (`findMeeting`).
- **Satır düzeltme**: `editCues` (1–25 düzenleme, metin ≤800, işlenirken reddedilir, özgün metin yalnız ilk seferde `raw`'a), API `PATCH /api/meetings/:id/cues`.
- **Biçimlendirici** `review.ts`: `formatMeetingList`, `formatMeetingOverview` (tanınmayan sesler, özet, öneriler `[id] tür · durum · başlık`), `formatTranscript` (`[indeks] mm:ss konuşmacı: metin`, "(düzenlenmiş)"), **`nextStep`** sırası: işleniyor→bekle · tanınmayan ses→adlandır · analiz yok→`meeting_analyze` · bekleyen öneri→uygula/geç · wiki yok→`meeting_finalize` · "inceleme tamam".
- **Sohbet kuralı**: `agents/prompts.ts` "TOPLANTI İNCELEME" bloğu (sesleri onayla adlandır; aynı kişi=aynı ad; "(Ben)"=kullanıcı; satırı yalnız emin olunca düzelt, rakam tahmin etme; mail gönderme yok).
- **Arayüz**: açık toplantı penceresi sohbetin bağlamı olur (`ChatRef.kind='meeting'`, Headphones rozeti), "Güneş'le birlikte" düğmeleri hazır istem gönderir, pencere sohbet değişikliklerini **4 sn'de bir tazeleyerek** gösterir (`MeetingDetail`, `App.tsx` `onAsk`/`onFocusMeeting`).
- Doğrulama durumu: birim testleri (biçimlendirici, izin, `user_confirmed`, düzenleme) ve typecheck/build temiz; **gerçek `claude` CLI ile uçtan uca sohbet akışı ve görsel tarayıcı denemesi yapılmadı**.

## 8b. Yüz yüze toplantı (manuel dinleme)
Toplantılar → "Yüz yüze" sekmesi. **Akış**: ad/proje/odadakiler → "Dinlemeye başla" (sesli duyuru AYARLARDAN açıksa "Duyuruyu yap ve dinle": varsayılan KAPALI, `inPersonAnnounce`) → tam ekran duyuru (Güneş sesli okur, metin ekranda; en az 4 sn; "Duyuruyu geç"/"Vazgeç") → duyuru BİTTİKTEN sonra `POST /api/meetings/inperson` → "Sizi dinliyorum" ekranı (sayaç, "Bitir ve işle", "Kaydı at") → bitince (duyuru açıksa) kısa teşekkür sesi → AYNI toplantı hattı (`finishNative` → `processMeeting` → refine/analiz → sihirbaz); listede `in_person` etiketi.
- **Yalnız mikrofon**: `startNative(..., {inPerson:true})` → `ses-yakala.ps1 -NoSys` (loopback yok; Güneş'in kendi hoparlör sesi ve başka sesler kayda girmez). `capture.wav` tek kanal.
- **İşaret**: şema değişmedi; `yuzyuze.flag` dosyası (`markInPerson`/`isInPerson`, `pipeline.ts`). Varlığında `classifyCuesByChannel` ATLANIR; "kendi ses" yalnız ses profilinden gelir.
- **Odadakiler** (`attendees`, `live.ts`): ses tanıma `candidateProfiles` ile bu kişilerle daraltılır.
- **Metin**: `web/src/lib/inperson.ts` (`DEFAULT_GREETING`, `greetingText`, `parseNames`); ayarlar `inPersonAnnounce`, `inPersonText` (`lib/settings.ts`, `{ad}` yer tutucu). Arayüz: `InPersonPanel.tsx` (`InPersonLauncher`, `InPersonLive`); `LiveState.inPerson`, `liveCapture.startInPerson/discard`. `/live/status` `inPerson` döner; `LivePill` "(yüz yüze)" yazar.
- Testler: `server/test/inperson.test.ts`, `web/test/inperson.test.ts`.

## 9. Toplantı öncesi / sonrası
`prep` işi (`scheduler.ts`): toplantıdan ~40 dk önce başlar, 30 dk önce hazır olur; `meetingPrepPrompt` + `context.ts` (`relatedMeetings`, `previousMeetingsContext`: geçmiş toplantıların karar/aksiyon/bekleyen önerileri); belirsizlikte "Size sorularım". **Haftalık rapor** haftanın toplantı kararlarını içerir (`weekMeetingsContext`). Bugün ekranında `NextUp.tsx` sıradaki toplantıyı, geri sayımı ve hazırlık notunu gösterir.

## 10. Toplantı sonrası tek ekran (`MeetingDetail`)
`review`/`done` toplantıda sihirbaz: **Sesler → Özet ve kararlar → Öneriler → Bitir** ("Tüm ayrıntıları göster" eski görünüm). Esc ile kapanır. Öneriler yine onaysız uygulanmaz.

## 11. Dosya → sorumluluk özeti
`api.ts` yönlendirme (`meetingsRouter`, `voicesRouter`, `insideDir`, `SAFE_MEETING_ID`'li `idOf`) · `pipeline.ts` hat+isimlendirme+özet+wiki · `voices.ts` · `channels.ts` · `capture.ts` · `callwatch.ts` · `ringwatch.ts` · `callpopup.ts` · `callid.ts` · `refine.ts` · `proposals.ts` · `context.ts` · `retention.ts` · `live.ts` (`startLiveMeeting`) · `tools.ts` · `review.ts`.
Testler: `meetings`, `callwatch`, `ringwatch`, `precall`, `callpopup`, `callid`, `capture`, `channels`, `refine`, `proposals`, `context`, `review`.
