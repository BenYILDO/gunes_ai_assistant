-- ============================================================
-- Güneş — 0005: Takvim etkinliklerine bitiş saati (odak planı için)
-- SQL Editor'de bir kez çalıştırın. Çalıştırılmazsa Güneş yine çalışır;
-- sadece odak planı toplantı sürelerini 60 dk varsayar.
-- ============================================================
alter table events add column if not exists ends_at timestamptz;
