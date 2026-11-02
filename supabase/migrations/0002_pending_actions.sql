-- ============================================================
-- Güneş — 0002: Onay bekleyen eylemler
-- Güneş silme gibi geri alınamaz işleri kendisi yapmaz; burada önerir,
-- kullanıcı arayüzden onaylar. SQL Editor'de bir kez çalıştırın.
-- ============================================================
create table if not exists pending_actions (
  id          uuid primary key default gen_random_uuid(),
  action      text not null check (action in ('delete_card','delete_memory')),
  target_id   uuid not null,
  title       text not null,            -- silinecek şeyin kısa adı (gösterim için)
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists pending_actions_status_idx on pending_actions(status, created_at desc);
alter table pending_actions enable row level security;
