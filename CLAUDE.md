# Güneş — geliştirici notları

Kişisel asistan: Outlook/Teams'i takip eder, kanban yönetir, hafızası vardır. Kullanıcı arayüzü ve tüm metinler **Türkçe**.

## Mimari
- `server/src/index.ts` — Express sunucu (127.0.0.1), API + derlenmiş arayüzü sunar, zamanlayıcıyı başlatır.
- `server/src/claude/runner.ts` — resmi `claude` CLI'ını `-p --output-format stream-json` ile başlatır. API anahtarı YOK; kullanıcının Claude üyeliği kullanılır. Araç izinleri `toolPreset()` içinde (collector / planner / chat / notifier).
- `server/src/mcp.ts` — Güneş MCP sunucusu. Claude panoya/hafızaya SADECE bu araçlarla yazar. Güvenlik kuralları burada: ajan `done` yapamaz, kilitli hafıza değiştirilemez.
- `server/src/agents/` — `prompts.ts` (toplayıcı/planlayıcı/sohbet talimatları), `pipeline.ts` (morning/tracker/backfill akışı), `soul.ts` (ruh çekirdeği + hafıza bağlamı).
- `server/src/scheduler.ts` — cron yok; her dakika durum kontrolü (uyku/kapalı PC telafisi).
- `server/src/store/` — `Store` arayüzü; `supabase.ts` (asıl) ve `local.ts` (Supabase yoksa JSON dosyası).
- `supabase/migrations/` — şema. Yeni tablo/kolon eklerken yeni bir numaralı migration dosyası açın ve `store/types.ts`, iki store uygulaması ve gerekirse MCP aracını birlikte güncelleyin.
- `server/src/wiki.ts` — LLM Wiki: slug, `[[bağlantı]]` çıkarma, `data/wiki` Obsidian kopyası (index.md, log.md). Ham kaynak = `events`, wiki = `wiki_pages`, dizi↔proje = `thread_links`.
- `server/src/weather.ts` — Open-Meteo (anahtarsız) hava + gün doğumu/batımı; konum tarayıcıdan `/api/location` ile gelir.
- `server/src/usage.ts` — Claude kullanım limiti (CLI `rate_limit_event`).
- `server/src/search.ts` — birleşik arama (wiki + kart + olay + hafıza); `/api/search`, MCP `search_knowledge`, arayüzde Ctrl+K.
- `server/src/focus.ts` — odak planı: takvim boşluklarını bulur, kartları öncelik/son tarihe göre yerleştirir (kural tabanlı, takvime yazmaz). `events.ends_at` (migration 0005) yoksa toplantı 60 dk sayılır.
- `server/src/health.ts` — son çalışması hata veren işler (`/api/health`, arayüz uyarı bandı, yeniden dene) ve doctor ayar kontrolleri.
- `server/src/usage.ts` — iş öncelik katmanları: kritik (morning/weekly/prep) yalnızca limit dolunca, normal (tracker) `GUNES_USAGE_PAUSE_AT`'ta, düşük (backfill/wiki/followup/reflection) `GUNES_USAGE_DEFER_AT`'ta ertelenir. Elle başlatılan işler (`manual`) ertelenmez.
- `server/src/draft.ts` — kart için yanıt taslağı (araçsız, gönderilmez). `server/src/report.ts` — brifing/haftalık rapor Markdown dışa aktarma (`data/wiki/raporlar`, `GUNES_REPORT_DIR`).
- `server/src/compose.ts` — serbest mail taslağı, 3 aşama: Sonnet (modelThink) soruları çıkarır → Haiku (modelScan, `researcher` ön ayarı: yalnızca okuma) wiki/hafıza/Outlook/Teams'ten yanıtlar → Sonnet yalnızca bulgularla yazar. `POST /api/draft/compose`, arayüzde Header'daki Mail düğmesi. Göndermez, Outlook'a taslak bile yazmaz. Yeni bir MCP yazma aracı eklerseniz `runner.ts` → `GUNES_WRITE_TOOLS`'a ekleyin (test kırılır).
- `server/src/security.ts` — Host (DNS rebinding) ve Origin (CSRF) koruması; `/api` yazma isteklerinde yabancı Origin reddedilir.
- `web/` — React + Vite + Tailwind v4 + `motion/react`. Tema `html[data-phase]` (dawn/day/dusk/night) CSS değişkenleriyle; `SunCore.tsx` ana görsel kimlik.

## Komutlar
- `npm run build` · `npm start` · `npm run dev` · `npm run typecheck`
- `npm test` — `server/test/` (node:test + tsx): MCP güvenlik kuralları (gerçek MCP sunucusunu başlatır), araç izinleri, Origin koruması, arama, odak planı, kullanım, rapor. CI: `.github/workflows/ci.yml`.
- `npm run demo` (yerel modda örnek veri) · `npm run doctor -- --live`
- Arayüz önizleme: `?intro=1`, `?phase=night`

## Kurallar
- Güneş asla mail/mesaj göndermez; M365 yazma araçları `config.ts` → `M365_FORBIDDEN_TOOLS` listesinde açıkça yasaklıdır. Bu listeyi daraltmayın.
- Windows hedef platform: yollar `node:path` ile, `claude` başlatma `shell` gereksinimi `runner.ts`'de ele alınır. PowerShell betikleri UTF-8 BOM ile kaydedilmeli; `.vbs` dosyaları sadece ASCII.
- Uzun içerik (ruh/hafıza/pano bağlamı) CLI'a argüman olarak değil **stdin** ile verilir (Windows komut satırı sınırı).

## Testler
- Test dosyaları `import './env.js'` ile BAŞLAMALI: geçici `GUNES_DATA_DIR` ve Supabase'siz yerel mod ayarlar (gerçek veriye dokunmaz).
- `M365_FORBIDDEN_TOOLS`, ajan `done` yapamaz ve kilitli hafıza kuralları testle korunur; bunları gevşeten değişiklik testleri kırar (kasıtlı).

## Güneş panosu (MCP)
Bu repoda `mcp__gunes__*` araçları kullanılabilir. Kullanıcı bir işi bitirdiğinde veya ilerleme kaydettiğinde ilgili kartı `update_card` (note ile) ya da `move_card` ile güncelleyin; kartı asla `done` yapmayın.
