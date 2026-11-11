# Güvenlik ve testler

## Değişmez kurallar (kasıtlı olarak testle korunur; gevşeten değişiklik testleri kırar)
1. **Güneş mail/mesaj göndermez, silmez, takvime yazmaz.** M365 yazma araçları `server/src/config.ts` → `M365_FORBIDDEN_TOOLS`. Listeyi daraltma. Taslaklar (`draft.ts`, `compose.ts`, `followupDraft`) yalnız metin üretir; Outlook'a taslak bile yazılmaz.
2. **Ajan kartı `done` yapamaz**; en fazla gerekçeli "Kapatılabilir". Onay kullanıcının.
3. **Kilitli hafıza** (`soul`, `soul_core`) değiştirilemez, öneri olarak da sunulamaz.
4. **Toplantı önerileri onaysız uygulanmaz**; sohbet aracı `meeting_apply_proposal` `user_confirmed: true` ister.
5. **Puan/ödül yalnız kullanıcı eylemiyle**; Güneş satın alma yapmaz.
6. **Ses profilleri biyometrik (KVKK)**: silinebilir, ses dosyası Supabase'e gitmez; arayan görüntüsü her durumda silinir.
7. Güneş yalnız `127.0.0.1`'e bağlanır.

## Yazma aracı ekleme kuralı
Yeni MCP **yazma** aracı → `runner.ts` içindeki `GUNES_WRITE_TOOLS`'a ekle (yoksa `compose.test.ts`/`permissions.test.ts` kırılır). Yalnız sohbette olacaksa `chatOnly` listesine (ajan ve `researcher` yasak listesine girer). Toplantı inceleme araçları `MEETING_CHAT_TOOLS` dizisindedir.

## Web güvenliği (`server/src/security.ts`, `server/test/api-security.test.ts`)
- **Host** kontrolü (DNS rebinding) + **Origin** kontrolü (CSRF): `/api` yazma isteklerinde yabancı Origin reddedilir. MCP'nin yerel HTTP çağrıları Origin başlığı göndermediği için geçer.
- Toplantı kimliği `SAFE_MEETING_ID` regex'iyle doğrulanır (`meetingDir`, `idOf`): **yol geçişi yok**. `insideDir` dosya yollarını sınırlar.
- Pet uçları `txt()/num()` ile düz tür kabul eder (nesne enjeksiyonu 500 vermez).
- Test gerçek HTTP ile: Origin, Host (ham `http.request` gerekir; `fetch` Host'u değiştirmez), yol geçişi, bozuk girdi.

## Test altyapısı
- `npm test` = node:test + tsx; **200 test**. Dosyalar `import './env.js'` ile BAŞLAMALI (geçici `GUNES_DATA_DIR`, Supabase'siz yerel mod; gerçek veriye dokunmaz).
- Gerçek MCP sunucusunu başlatan testler: `mcp.test.ts`.
- CI: `.github/workflows/ci.yml` (typecheck + test + build). `package-lock` `engines` `>=22.15` ile hizalı.

## Test → korunan davranış
| Test | Korur |
|---|---|
| `mcp.test.ts`, `permissions.test.ts` | Ajan `done` yapamaz, kilitli hafıza, araç izin listeleri |
| `compose.test.ts` | Mail taslağı 3 aşama, bilinen araç kümesi (`MEETING_CHAT_TOOLS` dahil), `researcher` salt okunur |
| `review.test.ts` | `cleanPersonName`, "(Ben)" gizleme, aynı ad → tek profil, `editCues` kuralları, `nextStep`, sohbet-özel araç kapısı, `user_confirmed` |
| `meetings.test.ts` | Hat, konuşmacı eşleştirme, profil birleşmesi |
| `callwatch/ringwatch/precall/callpopup/callid/capture/channels.test.ts` | Arama algılama durum makinesi, çalarken sorma, 1 dk önceden sorma, popup satırları, arayan tanıma, yakalama bağımsız argümanları/`pickMic`, kanal tabanlı kendi ses |
| `refine.test.ts` | Haiku iyileştirmede rakam/özel ad sınırları |
| `proposals.test.ts` | Öneri doğrulama, `followup_mail` yalnızca metin, alıcı kısıtı |
| `context.test.ts` | Önceki toplantı bağlamı, hafta toplantıları |
| `pet.test.ts` + `web/test/pet*.ts` | Puan sınırı, seri, freeze, günlük görev, kapalı=reddet, hareket matematiği |
| `focus/usage/search/report/health/draft/wiki.test.ts` | Odak planı, iş öncelik katmanları, birleşik arama, rapor, hatalı işler, taslak, wiki |
| `api-security.test.ts` | Origin/Host/yol geçişi/bozuk girdi |

## Doğrulanmamış / bilinen boşluklar (dürüst liste)
- Sohbet toplantı araçları: gerçek `claude` CLI ile uçtan uca denenmedi (birim testleri var).
- Teams doğrulaması (çalarken sorma/popup) kullanıcının makinesindeki gerçek aramalarla ölçülüyor; her Teams sürümünde pencere başlığı aynı olmayabilir.
- Sesli komutlar ("Güneş, katıl") ertelendi.
