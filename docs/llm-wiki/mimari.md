# Mimari

## Katmanlar
```
Windows açılışı → Güneş sunucusu (127.0.0.1:4317, yalnızca bu bilgisayar)
 ├ Zamanlayıcı (scheduler.ts, dakikalık): sabah (08:30) · takip (mesai içinde N saatte bir) · toplantı hazırlığı (prep) ·
 │   toplantı sonrası · haftalık rapor + iç gözlem (Cuma) · ses saklama temizliği
 ├ Ajan hatları (agents/pipeline.ts): ① Toplayıcı Haiku (Outlook+Teams+Takvim→events)
 │   ② Planlayıcı Sonnet (kart, öneri, brifing, günlük) ③ Bildirici Haiku (Teams'e özet, isteğe bağlı)
 ├ Sohbet köprüsü (chat.ts ↔ claude CLI, canlı akış, oturum hafızası)
 ├ Toplantılar (meetings/*) · Evcil hayvan (pet.ts) · Arama/Odak/Rapor/Taslak/Mail (search/focus/report/draft/compose.ts)
 └ Arayüz (web/) — sunucu derlenmiş `web/dist`'i sunar
Supabase: kartlar, olaylar, öneriler, brifing, hafıza (versiyonlu), sohbet, wiki_pages, thread_links, meetings, voice_profiles, state
```

## Sunucu dosyaları (hızlı sözlük)
| Dosya | Görev |
|---|---|
| `server/src/index.ts` | Express, zamanlayıcı, callWatcher, ringwatch, ses saklama başlatır |
| `server/src/api.ts` | Genel API (kart, hafıza, brifing, pet uçları, arama, taslak, health…) |
| `server/src/claude/runner.ts` | `runClaude`; `toolPreset()` (collector/planner/chat/notifier/meeting/researcher); `GUNES_READ_TOOLS`, `GUNES_WRITE_TOOLS`, `MEETING_CHAT_TOOLS`; görüntü desteği `runClaude({images})` |
| `server/src/mcp.ts` | MCP araçları + güvenlik kuralları; `gunesApi()` yerel HTTP köprüsü; toplantı araçları (sohbet-özel) |
| `server/src/agents/prompts.ts` | Toplayıcı/planlayıcı/sohbet/hazırlık/haftalık talimatları (sohbetteki "TOPLANTI İNCELEME" kuralı dahil) |
| `server/src/agents/soul.ts` | Ruh çekirdeği (kilitli) + hafıza bağlamı |
| `server/src/chat.ts` | Sohbet köprüsü, `ChatRef` (card/wiki/meeting), `TOOL_TR` Türkçe araç etiketleri |
| `server/src/wiki.ts` | LLM Wiki: slug, `[[bağlantı]]`, `data/wiki` Obsidian kopyası (index.md, log.md) |
| `server/src/search.ts` | Birleşik arama (wiki+kart+olay+hafıza), Ctrl+K, MCP `search_knowledge` |
| `server/src/focus.ts` | Odak planı: takvim boşluklarına kart yerleştirir (kural tabanlı, takvime yazmaz) |
| `server/src/usage.ts` | Claude kullanım limiti + iş öncelik katmanları (kritik/normal/düşük; `manual` ertelenmez) |
| `server/src/health.ts` | Hatalı işler (`/api/health`, uyarı bandı, yeniden dene) + doctor kontrolleri |
| `server/src/draft.ts` · `compose.ts` | Kart yanıt taslağı · serbest mail taslağı (3 aşama; göndermez, Outlook'a bile yazmaz) |
| `server/src/report.ts` | Brifing/haftalık rapor Markdown dışa aktarma (`data/wiki/raporlar`) |
| `server/src/weather.ts` | Open-Meteo hava + gün doğumu/batımı |
| `server/src/security.ts` | Host (DNS rebinding) + Origin (CSRF) koruması |
| `server/src/config.ts` | Ortam/ayarlar, `M365_FORBIDDEN_TOOLS`, `gunesTool()` |
| `server/src/store/{types,supabase,local,index}.ts` | Veri katmanı |

## Veri (yeni tablo/kolon eklerken)
1. `supabase/migrations/000N_*.sql` (numaralı yeni dosya)
2. `server/src/store/types.ts`
3. `store/supabase.ts` **ve** `store/local.ts` (ikisi birlikte)
4. Gerekirse MCP aracı (`mcp.ts`) + `README`/`doctor.ts` migration kontrolü

Migration'lar: 0001 ilk şema · 0002 pending_actions · 0003 attribution+wiki · 0004 weekly · 0005 `events.ends_at` · 0006 `meetings`+`voice_profiles` · 0007 toplantı önerileri (`proposals`).
Evcil hayvan durumu şema istemez: `state` anahtar-değer deposunda.

## Claude'a araç izni modeli
- Her ajan türü kendi `toolPreset()`'ini alır; yazma araçları yalnız ilgili ajanda açık.
- **Sohbet-özel** araçlar (`compose_mail`, toplantı inceleme araçları) `chatOnly` listesindedir: ajanlar ve `researcher` çağıramaz (test: `server/test/compose.test.ts`, `review.test.ts`).
- Uzun bağlam (ruh/hafıza/pano) CLI'a **stdin** ile gider (Windows komut satırı sınırı).
- M365 yazma araçları `M365_FORBIDDEN_TOOLS`'ta yasak; listeyi daraltma.

## Ortam değişkenleri (`.env.example`; yalnızca ad, değerler orada)
Kullanıcı: `GUNES_USER_NAME/TITLE/ROLE`, `GUNES_TIMEZONE`, `GUNES_PORT`. Modeller: `GUNES_MODEL_SCAN/THINK/CHAT`. Zamanlama: `GUNES_SCHEDULER`, `MORNING_TIME`, `WORK_*`, `TRACKER_EVERY_HOURS`, `WEEKLY_*`, `MEETING_PREP`, `MEETING_PREP_LEAD_MIN`, `MEETING_FOLLOWUP`, `BACKFILL_*`. Kullanım: `USAGE_PAUSE_AT`, `USAGE_DEFER_AT`. Toplantı: `WHISPER_DIR`, `PYTHON`, `RECORDINGS_DIR`, `VOICE_THRESHOLD`, `CALL_WATCH`, `CALL_APPS`, `CALL_POPUP`, `CALL_SCREENSHOT`, `NATIVE_CAPTURE`, `MIC_DEVICE`, `PRECALL_LEAD_SEC`, `AUDIO_RETENTION_DAYS`, `REFINE`, `AUTO_ANALYZE`. Diğer: `TTS_VOICE`, `LAT/LON`, `VIP_PEOPLE`, `IGNORE`, `REPORT_DIR`, `TEAMS_SELF_CHAT_ID`.

## Komutlar
`npm run build` · `npm start` · `npm run dev` · `npm run typecheck` · `npm test` · `npm run demo` (örnek veri, yerel mod) · `npm run doctor -- --live`. Arayüz önizleme: `?intro=1`, `?phase=night`. CI: `.github/workflows/ci.yml`.

## Platform notları
Windows hedef. Yollar `node:path`. PowerShell betikleri **UTF-8 BOM**; `.vbs` yalnız ASCII. Kurumsal ağ için Windows sertifika deposu kullanılır (`2a080b9`). `claude` başlatma `shell` gereksinimi `runner.ts`'de.
