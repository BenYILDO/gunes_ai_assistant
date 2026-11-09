-- ============================================================
-- Güneş — 0007: Toplantı sonrası analiz ve öneriler
-- SQL Editor'de bir kez çalıştırın. Çalıştırılmazsa Toplantılar yine çalışır; yalnızca
-- "Güneş'in önerileri" (kart/wiki/hafıza önerileri) kaydedilemez.
-- ============================================================
-- analysis  : toplantının yapılandırılmış özeti (özet, konular, kararlar, aksiyonlar)
-- proposals : Güneş'in önerdiği işler (kart aç/güncelle, wiki'ye yaz, hafızaya al); her biri kullanıcı onayı bekler
alter table meetings add column if not exists analysis  jsonb;
alter table meetings add column if not exists proposals jsonb not null default '[]'::jsonb;
