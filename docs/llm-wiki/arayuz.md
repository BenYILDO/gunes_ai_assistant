# Arayüz (`web/`)

React + Vite + Tailwind v4 + `motion/react`. Tüm metin Türkçe. Tema `html[data-phase]` (dawn/day/dusk/night) CSS değişkenleriyle; ana görsel kimlik `SunCore.tsx`; gök `Sky.tsx`; hava `WeatherChip.tsx` (konum tarayıcıdan `/api/location`). Ana durum/yönlendirme: `web/src/App.tsx`; API istemcisi ve tipler `web/src/lib/api.ts`; ayarlar `lib/settings.ts` (tarayıcıda saklanır).

## Ekranlar/bileşenler
- **Karşılama/Brifing**: `Intro.tsx`, `Briefing.tsx`, `BriefingView.tsx`, `VoiceBriefing.tsx` (sesli brifing, sürekli dinleme `lib/listener.ts`, TTS `lib/speech.ts`), akşam `Farewell.tsx`, `EndOfDayPrompt.tsx` ("Bugünlük yeter").
- **Bugün ekranı** (`BriefingView` + `NextUp.tsx`, `525908f`): sıradaki toplantı, geri sayım, hazırlık notu, karar bekleyen işler; Pazartesi–Çarşamba `WeeklyRecap.tsx`.
- **Pano**: `Board.tsx`, `BoardWorkspace.tsx` (Excel tarzı yakınlaştırma, odak modu, filtre çubuğu), `CardModal.tsx`, `FocusPanel.tsx` (odak planı), `DraftBox.tsx` (yanıt taslağı).
- **Hafıza/Wiki/Geçmiş**: `MemoryView.tsx`, `WikiView.tsx`, `HistoryView.tsx`; arama `SearchPalette.tsx` (Ctrl+K).
- **Sohbet**: `ChatPanel.tsx`; seçili bağlam `ChatRef` = kart | wiki | **toplantı** (chip simgeleri SquareKanban/BookOpen/Headphones); `ComposeModal.tsx` (Mail düğmesi: serbest mail taslağı).
- **Toplantılar**: `MeetingsView.tsx` (≈1000 satır: liste, `MeetingDetail` sihirbazı, ses isimlendirme, öneriler), `LivePill.tsx`, `CallPrompt.tsx` (tarayıcı popup'ı; Windows popup'ı açıkken gizli), `lib/liveCapture.ts`, `lib/callState.ts`.
- **Gelen kutusu** (`Inbox.tsx` + `lib/inbox.ts`; saf mantık `web/test/inbox.test.ts`): nudge'lar önem sırasına göre (acil/gecikme > toplantı > diğer). Sessiz saatler ve "aramadayken sessiz" (`quietOn/quietFrom/quietTo/callQuiet`) **yalnızca açılır pencereyi/sesli okumayı** susturur; **acil olanlar her zaman çıkar**. "Sonra" pencereyi gizler, gelen kutusunda bırakır; "Okundu" sunucuda `seen`. Sunucudaki Windows masaüstü bildirimi sessiz saatlerden etkilenmez.
- **Diğer**: `Header.tsx` (saat+hava tek kolon, dar pencerede sekmeler kendi satırında), `SettingsPanel.tsx` (okuma hızı, AI kullanımı `UsageMeter.tsx`, konum/hava, sessiz saatler, evcil hayvan), `ProblemBanner.tsx` (hatalı işler uyarı bandı), `Toasts.tsx`, `NudgePopup.tsx`, `Approvals.tsx`, `Suggestions.tsx`, `WeeklyCard.tsx`, `Markdown.tsx`, `ui.tsx`.
- Evcil hayvan bileşenleri → [evcil-hayvan.md](evcil-hayvan.md).

## Sohbet ↔ toplantı bağlama (son özellik)
`MeetingsView` → `onFocusMeeting(ref|null)`: pencere açılınca `App.tsx` `setChatRef({kind:'meeting',id,title})`, kapanınca (yalnız toplantı bağlamıysa) temizler. `onAsk(text, ref)`: "Güneş'le birlikte" düğmeleri (İncele / Sesleri adlandıralım (N) / Yanlış duyulanları bul / Önerileri anlat) bağlamı kurar ve `sendToChat` ile istem gönderir. `MeetingDetail` açıkken 4 sn'de bir yeniler (`busy` değilse, sekme görünürse).

## Erişilebilirlik / UX (`d7eac93`)
Dar ekranda sekmeler kaydırılabilir satır, üst çubuk düğmeleri sarılır; ikon düğmelere `aria-label`; tüm etkileşimli öğelerde belirgin `:focus-visible` halkası (`styles/index.css`); toplantı penceresi Esc ile kapanır; "hareket azalt" tercihine saygı.

## Arayüz testleri
`web/test/`: `inbox`, `pet`, `petmotion`, `recap` (saf mantık). Arayüz önizleme: `?intro=1`, `?phase=night`; `npm run demo` ile örnek veri.
