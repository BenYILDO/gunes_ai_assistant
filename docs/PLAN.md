# Güneş — Plan ve kararlar

Bu doküman, Güneş'in tasarım konuşmasında alınan kararları özetler. Yeni bir oturumda geliştirmeye devam ederken önce bunu okuyun.

## Amaç
Yıldıray Bey'in (Alişan Lojistik, IT / Dijital Dönüşüm) Outlook ve Teams geçmişini 1–1,5 aylık pencereyle takip eden; yapılacak işleri, unutulan mailleri ve gözden kaçan ayrıntıları her sabah özetleyen; işleri kendi kanban panosuna kart olarak atayan; hafızası ve ruhu olan kişisel asistan.

## Temel kararlar
| Konu | Karar | Neden |
|---|---|---|
| Model erişimi | Resmi `claude` CLI (Claude Code), Pro üyeliği | API maliyeti istenmiyor; üyelik oturum anahtarı çekilmez (kullanım şartlarına aykırı) |
| Çalışma yeri | Tamamen lokal (Windows), açılışta başlar | Sohbet köprüsü zaten lokal; tek ortam |
| 08:30 görevi | Her dakika durum kontrolü + kaçırılanı telafi | PC kapalı/uykudaysa açılışta çalışır |
| Takip sıklığı | Mesai içinde 2 saatte bir | Yeni olay yoksa planlayıcı çalışmaz (limit tasarrufu) |
| Veri | Supabase (RLS açık, politika yok, sadece service_role) | Tek kaynak; yer sorunu yok |
| Yetki | Okuma + taslak | Hiçbir şey onaysız dışarı çıkmaz |
| Mobil | Sabah özeti Teams'te kendine mesaj | Ek kurulum gerektirmez |
| Modeller | Tarama Haiku, planlama/sohbet Sonnet | Pro limitine uygun katmanlı yapı |
| Planner | Kendi kanbanımız | Microsoft Planner lisansı yok |
| İsim | Güneş | Sabah karşılama konseptiyle uyumlu |

## Ruh ve hafıza
- **Çekirdek (kilitli):** sıcak, her zaman saygılı, meraklı/araştırmacı, açıkları arar, dırdır etmez (brifing başına en fazla 1–2 sorgulama), asla mail göndermez, kartı "Bitti" yapmaz. Hitap: "Yıldıray Bey".
- **Gelişen katman (`soul`):** konuşmalardan öğrenilen üslup. Kullanıcı onayıyla yazılır.
- **Katmanlar:** `user` (seni tanıma), `memory`/`lesson` (uzun vadeli, dersler), `person`, `project`, `journal` (günlük).
- **İnsan gibi hafıza:** her anının `importance` (1–5) ve `strength` değeri var. Kritik anılarda `original_excerpt` ile orijinal cümle korunur; hatırlanan anı güçlenir (`recall`). Değişiklik geçmişi `memory_versions` tablosunda.

## Faz planı
- **Faz 1 (tamamlandı):** toplayıcı/planlayıcı/takipçi ajanları, sohbet (canlı akış, oturum hafızası), Güneş MCP aracı, temel hafıza, kanban, karşılama animasyonları (evreye göre), Windows açılışı.
- **Faz 2:** önem puanlı sıkıştırma (haftalık "rüya" döngüsü), 45 günden eski günlükleri aylık özete indirme, Cuma "seni şöyle tanıdım" onay kartı, arayüzde SOUL değişikliği onayı.
- **Faz 3 – Araştırmacı:** talep üzerine derin araştırma kartları; haftalık rakip/sektör radarı (GitHub, Reddit r/logistics r/supplychain, Hacker News, FreightWaves, The Loadstar, Lojiper, UTİKAD, Resmî Gazete; X/LinkedIn web araması üzerinden dolaylı). Bekleyen girdiler: izlenecek 3–5 rakip, takip konuları.
- **Faz 4 – Canlı takip:** Claude Code oturumları ve GitHub commit'lerinden proje kartlarına otomatik ilerleme.

## Bekleyen bilgiler
- VIP kişiler (`GUNES_VIP_PEOPLE`)
- Hariç tutulacak klasör/kişi/konular
- Teams "kendime not" sohbet kimliği (`GUNES_TEAMS_SELF_CHAT_ID`)
- İzlenecek rakipler ve sektör konuları (Faz 3)
