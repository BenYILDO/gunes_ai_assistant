# Güneş — LLM Wiki (önce bunu oku)

> Amaç: başka bir modelin projeyi **az token** ile kavraması. Önce bu sayfayı oku (≈1 bin token), sonra yalnızca sorunun ilgili sayfasını aç. Kaynak kod gerçeğin kendisidir; bu wiki haritadır. Her sayfada `dosya` referansları repo köküne göredir. Son güncelleme: 2026-11-11, dal `evcil-hayvan`, son commit `4005da2`.

## Güneş nedir (3 cümle)
Kişisel asistan: Outlook/Teams'i okur, kanban panosu tutar, hafızası vardır, Türkçe konuşur. **API anahtarı yok**: resmi `claude` CLI'ını (kullanıcının Claude üyeliği) alt süreç olarak çalıştırır. Güneş **asla mail/mesaj göndermez**; her yazma işlemi kendi MCP sunucusundan, şema ve güvenlik kurallarıyla geçer.

## Sayfa haritası
| Sayfa | Ne zaman aç |
|---|---|
| [mimari.md](mimari.md) | Katmanlar, veri akışı, store, MCP, ajanlar, zamanlayıcı, komutlar, ortam değişkenleri |
| [toplantilar.md](toplantilar.md) | Toplantı hattı: arama algılama → ses yakalama → transkript → konuşmacı → özet/öneri → sohbetle inceleme |
| [evcil-hayvan.md](evcil-hayvan.md) | Kedi/tilki, puan, mağaza, rozet, seri koruyucu, günlük görevler |
| [arayuz.md](arayuz.md) | `web/` yapısı: Bugün ekranı, Gelen kutusu, sohbet bağlamı, tema, erişilebilirlik |
| [guvenlik-ve-testler.md](guvenlik-ve-testler.md) | Değişmez kurallar, korumalar, hangi test neyi korur |
| [kronoloji.md](kronoloji.md) | Commit commit: ne yapıldı, ardından ne geldi, hangi dosyalara dokundu |
| [kararlar-ve-sinirlar.md](kararlar-ve-sinirlar.md) | Neden böyle; ölçülmüş sınırlar; tuzaklar (Windows/PowerShell); yapılmayanlar |

## 10 satırda mimari
1. `server/src/index.ts` Express (127.0.0.1:4317) API + derlenmiş arayüz + zamanlayıcı.
2. `server/src/claude/runner.ts` `claude -p --output-format stream-json`; araç izinleri `toolPreset()`.
3. `server/src/mcp.ts` Güneş MCP sunucusu (stdio, 40 `registerTool`); panoya/hafızaya yazmanın TEK yolu.
4. `server/src/agents/` toplayıcı (Haiku) → planlayıcı (Sonnet) → bildirici; `prompts.ts`, `pipeline.ts`, `soul.ts`.
5. `server/src/scheduler.ts` cron yok, dakikalık durum kontrolü (kapalı PC telafisi).
6. `server/src/store/` `Store` arayüzü: `supabase.ts` (asıl) + `local.ts` (JSON, Supabase yoksa).
7. `server/src/meetings/` toplantı hattı (17 dosya, ~4,7 bin satır) → [toplantilar.md](toplantilar.md).
8. `server/src/pet.ts` sadakat sistemi (saf fonksiyonlar) → [evcil-hayvan.md](evcil-hayvan.md).
9. `web/` React + Vite + Tailwind v4 + `motion/react`; tema `html[data-phase]`.
10. `scripts/windows/*.ps1` (mikrofon/pencere/ses yakalama), `scripts/whisper/*` (ölçüm + konuşmacı gömme).

## Sık sorular → nereye bakmalı
- "Bir arama gelince ne olur?" → toplantilar.md §2–3
- "İki ses aynı ada verilirse?" → toplantilar.md §6 (`nameSpeaker`, birleşir)
- "Sohbet toplantıyı nasıl düzenler?" → toplantilar.md §8 (`MEETING_CHAT_TOOLS`, `review.ts`)
- "Yeni tablo/kolon eklemek?" → mimari.md §Veri (migration + types + iki store + MCP)
- "Yeni MCP yazma aracı eklemek?" → guvenlik-ve-testler.md (`GUNES_WRITE_TOOLS` + test)
- "Puan nasıl kazanılır?" → evcil-hayvan.md §Puan
- "Neden Whisper turbo-q5 greedy?" → kararlar-ve-sinirlar.md §Ölçümler

## Rakamlar (2026-11-11)
- Repo: 50 commit, 2026-11-02 → 11-10. Mail taslağı commit'inden (`51d14c1`, 11-09) bu yana: **102 dosya, +12.053 / −57 satır**.
- `npm test`: **200 test geçiyor** (sunucu `server/test/*.test.ts` + arayüz `web/test/*.test.ts`), typecheck ve build temiz.
- Migration: `0001`…`0007` (`supabase/migrations/`).

## Wiki'yi güncelleme kuralı
Yeni özellik → ilgili sayfaya bölüm + `kronoloji.md`'ye satır + `CLAUDE.md`'ye kısa not. Sayfaları şişirme; ayrıntı koddadır, burada **neden/nerede** yazar.
