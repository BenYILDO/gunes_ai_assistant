# Kronoloji (commit commit)

Format: `hash tarih — ne` → **dokunulan başlıca dosyalar** → *neden/sonraki adım*. Tam liste: `git show --stat <hash>`.

## Faz 0 — Temel (2–4 Kasım) [varsayım: ilk LinkedIn yazısı bu dönemi anlattı]
- `e6c0370` 11-02 Güneş Faz 1: ajanlar, kanban, sohbet, animasyonlu arayüz → `server/src/{agents,claude,mcp.ts,store}`, `web/`.
- `2a080b9` kurumsal ağ (Windows sertifika deposu) · `57e0440` kullanım göstergesi · `a133bb3` sohbetten tarama/onaylı silme.
- `781c7a5` "kimden geldi", belirsizse sor, Wiki, hava teması, günün gündemi → `wiki.ts`, `weather.ts`.
- `a8aa6eb`/`906614f` Güneş seslenir, wiki kayıttan kurulur, `wiki_edit` parça düzenleme (hız).
- `6851b41` Pano (yakınlaştırma, odak, filtre) · `a5f604c`/`b12cc81` brifing ekranı, akşam uğurlaması, sesli brifing, scrum.
- 11-02 Ses işleri: Azure Speech (Emel Neural), yedek ses zinciri, ses seçici, doğal duraklamalar.
- `a04e5eb`/`781b6b2`/`74d2774` ayarlar paneli, okuma hızı, opak katmanlar · `47b1ed2` sohbette kart/wiki referansı.
- 11-03 `9a81935` toplantı hazırlığı/sonrası, haftalık rapor, iç gözlem · `4924eb1` "Cannot coerce" düzeltmesi · seslendirme/tanıtım videosu betikleri (`scripts/promo`, `seslendirme/`).
- 11-04 `4cda579` Power Automate "Güneş İstek" akışı (`docs/power-automate`) · `e282c03` MCP güvenlik testleri + CI + Origin/CSRF (`security.ts`) · `bbcb064` birleşik arama (`search.ts`) · `2818777` kullanım katmanları (`usage.ts`) · `2cec9a5` hata görünürlüğü (`health.ts`) · `8789b89` odak planı (`focus.ts`, migration 0005) · `97568a9` yanıt taslağı (`draft.ts`) · `b3bc8b7` haftalık rapor dışa aktarma (`report.ts`) · `c924b02` faster-whisper ölçüm betiği.

## Faz 1 — Toplantılar (9 Kasım) [ikinci LinkedIn yazısının ana konusu]
1. `51d14c1` **Mail taslağı**: Sonnet soru → Haiku tarar → Sonnet yazar. → `compose.ts`(174), `mcp.ts`(+46), `ComposeModal.tsx`(181), `compose.test.ts`. *Göndermez.*
2. `9ff57d2` **Whisper deneyi**: whisper.cpp + sherpa-onnx, ölçüm raporu. → `scripts/whisper/{RAPOR.md,konusmaci.py,wer.py,…}`. *Sonuç: turbo-q5+VAD+greedy, WER %30,4, 1,01× gerçek zaman.*
3. `06f0be2` **Toplantılar v1**: yükleme/canlı dinleme, yerel transkript, konuşmacı tanıma, wiki bağlama. → `meetings/{api,pipeline,voices,tools}.ts`, `MeetingsView.tsx`(605), `liveCapture.ts`, migration `0006`, store (types/supabase/local), `meetings.test.ts`. *Ses profili Supabase'de, ses dosyası yerelde.*
4. `755a6f5` Başlık düzeni (saat+hava tek kolon).
5. `7f089fb` **Arama algılama**: mikrofon kayıt defteri izi → "katılayım mı?". → `callwatch.ts`, `retention.ts`, `ringlog.ts`, `CallPrompt.tsx`, `pencere-izle.ps1`. *Ses 30 gün saklanır.*
6. `adcc243` **Arayanı tanıma**: arama penceresi görüntüsü Claude'a okutulur (silinir). → `callid.ts`, `pencere-goruntusu.ps1`, `runner.ts` (`images`).
7. `39a2e7e` **Yerel ses yakalama** (WASAPI, izin penceresiz). → `capture.ts`, `ses-yakala.ps1`(232).
8. `327387b` **Windows popup'ı** (odağı çalmaz) + tarayıcısız "Katıl". → `callpopup.ts`, `arama-penceresi.ps1`, `live.ts`.
9. `9bb7a47` **Çalarken sorma**, **Haiku iyileştirme**, **toplantı sonrası öneriler**. → `ringwatch.ts`, `refine.ts`, `proposals.ts`(321), migration `0007`, 3 yeni test dosyası. *Gerçek Teams günlüğünden pencere imzası öğrenildi.*
10. `aeaef6d` **Kendi ses etiketi** (mikrofon kanalı) + **1 dk önceden sorma**. → `channels.ts`, `callwatch.ts` (`nextPlanned`).
11. `c794592` **Hazırlık zenginleşir** (önceki toplantılar, 30 dk önce hazır), haftalık rapora toplantı kararları, **mikrofon otomatik seçimi**. → `context.ts`, `capture.ts` (`pickMic`), `scheduler.ts`.

## Faz 2 — Günlük kullanım deneyimi (9–10 Kasım)
12. `525908f` 11-09 **Bugün ekranı + Gelen kutusu**. → `NextUp.tsx`, `Inbox.tsx`, `lib/inbox.ts`, `web/test/inbox.test.ts`.
13. `8de8431` 11-10 **Evcil hayvan (sadakat sistemi)** + **toplantı sonrası tek ekran**. → `pet.ts`(470), `PetCompanion.tsx`(754), `CatSide/CatLying/CatHead/PetWorld/PetPanel`, `lib/petMotion.ts`, `MeetingsView.tsx` (sihirbaz), `pet.test.ts`(270).
14. `d7eac93` 11-10 **Güvenlik + UI/UX turu**; seri koruyucu, günlük görevler, haftalık özet, takip maili taslağı. → `api-security.test.ts`(120), `WeeklyRecap.tsx`, `recap.ts`, `proposals.ts` (`followupDraft`), `pet.ts`, a11y düzeltmeleri. *Bulunan/düzeltilenler: `SAFE_MEETING_ID` yol geçişi, `/pet/buy` nesne girdisinde 500, mobil menü/başlık taşması, odak halkası, Esc.*
15. `4005da2` 11-10 **Sohbetle toplantı incelemesi**: 9 sohbet-özel MCP aracı, `review.ts`, `editCues` + `PATCH /:id/cues`, `cleanPersonName`, sohbet bağlamı `meeting`, pencere 4 sn tazeleme. → `mcp.ts`(+177), `review.ts`(87), `review.test.ts`(127), `ChatPanel.tsx`, `MeetingsView.tsx`, `App.tsx`. *Tetikleyici: kullanıcı 3 kişilik toplantıda 5 ses algılandığını, kendi sesinin seçilemediğini ve "(Ben)" yazdığını bildirdi.*

16. `(commit bekliyor)` 11-11 **Yüz yüze toplantı**: sesli duyuru + yalnız mikrofon dinleme + ayrı arayüz. → `InPersonPanel.tsx`, `lib/inperson.ts`, `live.ts`, `capture.ts` (`-NoSys`), `ses-yakala.ps1`, `pipeline.ts` (`markInPerson`), `api.ts` (`POST /inperson`), `inperson.test.ts` ×2. *Tetikleyici: kullanıcı "yüz yüze toplantılar için de manuel dinleme, başlamadan sesli uyarı" istedi.*

## Sonra ne geldi (ilişki zinciri)
Mail taslağı → "Whisper yerelde olur mu?" ölçümü → toplantılar → "aramaya kendim katılmayayım" için arama algılama → "kim arıyor?" için görüntü okuma → izinsiz yakalama için WASAPI → odak çalmayan popup → çalarken sorma (gerçek Teams günlüğü) → kendi sesi için kanal → hazırlık/öneri/takip → günlük kullanım (Bugün/Gelen kutusu) → motivasyon (evcil hayvan) → güvenlik/UX denetimi → sohbetle yönetim.
