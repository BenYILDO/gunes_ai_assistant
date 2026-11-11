# Evcil hayvan / sadakat sistemi

Dal `evcil-hayvan` (commit `8de8431`, güçlendirme `d7eac93`). **Varsayılan KAPALI**: `PetState.enabled` sunucuda; Ayarlar → Evcil hayvan. Kapalıyken hayvan/mağaza/pati düğmesi görünmez ve sunucu puan, ödül, besleme, ziyaret, sayaç, mağaza işlemlerini **reddeder** (`apply`/`earnPet` kapı bekçisi); veri silinmez. **Ceza ve ölüm yok.**

## Sunucu: `server/src/pet.ts` (≈500 satır, hepsi saf fonksiyon; test `server/test/pet.test.ts`)
- Durum `state` anahtar-değer deposunda (şema yok). API: `/api/pet`, `/pet/{feed,visit,buy,place,unplace,equip,species,name,event}`; girdiler `txt()`/`num()` ile düz türe zorlanır (nesne sızması 500 vermesin).
- **Besleme**: günde bir, seri (streak). Hafta sonu seriyi bozmaz (`missedWeekdays`, `streakAlive`).
- **Puan** (`earn`): kart `done` yapmayı YALNIZCA kullanıcı yapar (`PATCH /cards/:id` kancası), öneri uygulama, toplantı finalize, "Bugünlük yeter", besleme, günlük ziyaret. **İş puanı günde `WORK_CAP`=40** ile sınırlı; başarım ödülleri sınır dışı. Güneş (ajan) puan kazandıracak bir şey yapamaz.
- **Mağaza** (`ITEMS`/`buyItem`): mama kabı (ücretsiz, kaldırılamaz), yumak, minder, ev, fiyonk, şapka. **Tür** (`SPECIES`): kedi varsayılan, tilki 150 puan (`chooseSpecies`). `ACHIEVEMENTS` rozetler, `LEVELS`/`levelOf`. Güneş hiçbir şeyi onaysız satın almaz.
- **Seri koruyucu** (`freeze`, 25 puan, en çok `MAX_FREEZES`=3): `owned`'a girmez, `freezes` sayacı; kaçırılan **iş günlerini** karşılar, `feed` içinde harcanır.
- **Günlük görevler** (`DAILY_GOALS`): 3 kart kapat +5, Güneş'le 1 iş yap +3; isteğe bağlı, ceza yok, iş puanı sınırının dışında (`PetState.daily`, `earn` içinde).
- `moodOf`, `view` (arayüze giden görünüm), `unlockAchievements`.

## Arayüz (`web/src/components/` + `web/src/lib/`)
| Dosya | Görev |
|---|---|
| `Cat.tsx` → `CatSide.tsx` | Yandan görünen **dört ayaklı** kedi; dört vuruşlu yürüme döngüsü her karede ref ile (`useAnimationFrame`) |
| `CatLying.tsx` | Karnı üstüne yatan/uyuyan kedi (sfenks duruşu), kuyruk/bacak sallar |
| `CatHead.tsx` | Ortak yüz; `SKINS` kedi/tilki + aksesuarlar (tilki: yuvarlak, sevimli yeniden tasarım) |
| `PetCompanion.tsx` | Ana bileşen (≈750 satır): sürüklenir, sevilir, besler, konuşur; aramadayken/sessiz saatte/gece uyur |
| `PetWorld.tsx` | Sürüklenen eşyalar; yumak kendi fizik döngüsüyle fırlatılır, `pet-bat`/`pet-ball-thrown` olaylarıyla kedi oynar |
| `PetPanel.tsx` | Mağaza + profil + rozetler (Header'daki pati düğmesi) |
| `lib/pet.ts` | Gerçek duruma bağlı cümleler |
| `lib/petMotion.ts` | rAF tween, yay, konma noktası, `dropTarget` |
| `lib/recap.ts` + `WeeklyRecap.tsx` | **Haftalık özet**: Pazartesi–Çarşamba Bugün ekranında geçen haftanın kapanan kart/işlenen toplantı/uygulanan öneri/rozet sayıları (tamamen istemci; hayvan kapalıyken rozet yok) |

Davranışlar: kedi kendi kendine yürür; Pano açıkken `[data-card-id]` kartların üstüne zıplayıp yatar (kart kayarsa peşinden gider, kaybolursa/Pano kapanırsa iner). Kartın üstüne ya da panel çizgisinin yakınına **bırakılan** kedi oraya yapışır (`dropTarget`). Uykudayken sevilirse mırlar; art arda 3 sevgide `WAKE_MS` (3 dk) uyanık kalır, sonra yeniden uyur; uyanıkken çok sevilirse `EXCITE_MS` (90 sn) hareketli. Mama kabında yer, minderde dinlenir, yumakla oynar, uyku vaktinde evine girer. Uyurken/aramadayken/hareket-azaltmada yürümez. Ayarlar: `petOn`, `petScale` (0,5–1, varsayılan 0,75; değişince `key` ile yeniden kurulur). Puan/rozet toast'ları `App.tsx`'te `pet` farkından üretilir.

Testler: `server/test/pet.test.ts` (270 satır), `web/test/{pet,petmotion,recap}.test.ts`.
