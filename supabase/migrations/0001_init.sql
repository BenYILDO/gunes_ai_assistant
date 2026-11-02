-- ============================================================
-- Güneş — Faz 1 şeması
-- Supabase SQL Editor'de bir kez çalıştırın.
-- Tüm tablolarda RLS açık ve hiçbir politika yok: sadece
-- service_role anahtarı (bilgisayarınızdaki .env) erişebilir.
-- ============================================================

create extension if not exists pgcrypto;

-- Ortak updated_at tetikleyicisi
create or replace function gunes_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Projeler ----------
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  status      text not null default 'active' check (status in ('active','paused','done')),
  summary     text,                 -- Güneş'in güncel durum özeti
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Kanban kartları ----------
create table if not exists cards (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  status       text not null default 'inbox'
               check (status in ('inbox','todo','doing','waiting','review','done')),
  priority     text not null default 'medium'
               check (priority in ('low','medium','high','critical')),
  project_id   uuid references projects(id) on delete set null,
  due_date     date,
  waiting_on   text,                -- 'me' | 'them' | kişi adı
  people       text[] not null default '{}',
  tags         text[] not null default '{}',
  sources      jsonb  not null default '[]'::jsonb,   -- [{type, external_id, link, title, date}]
  created_by   text not null default 'gunes' check (created_by in ('gunes','user')),
  close_reason text,                -- Güneş 'review'a taşırken gerekçesi
  position     double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists cards_status_idx on cards(status);

-- ---------- Kart hareketleri ----------
create table if not exists card_activity (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references cards(id) on delete cascade,
  actor      text not null,         -- 'gunes' | 'user'
  kind       text not null,         -- created | moved | updated | note
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists card_activity_card_idx on card_activity(card_id, created_at desc);

-- ---------- Olaylar (mail / Teams / takvim) ----------
create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('outlook','teams','calendar','other')),
  external_id   text not null,
  occurred_at   timestamptz not null,
  from_name     text,
  from_address  text,
  subject       text,
  summary       text not null,
  excerpt       text,               -- önemli cümlelerin orijinal hali
  link          text,
  needs_reply   boolean not null default false,
  waiting_on    text,               -- 'me' | 'them' | null
  due_date      date,
  importance    smallint not null default 3 check (importance between 1 and 5),
  project_hint  text,
  processed     boolean not null default false,
  card_id       uuid references cards(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists events_unprocessed_idx on events(processed, occurred_at);

-- ---------- Öneriler ----------
create table if not exists suggestions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('reminder','risk','question','followup','idea')),
  title      text not null,
  body       text,
  card_id    uuid references cards(id) on delete cascade,
  status     text not null default 'open' check (status in ('open','accepted','dismissed')),
  created_at timestamptz not null default now()
);

-- ---------- Brifingler ----------
create table if not exists briefings (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('morning','tracker')),
  headline   text not null,
  content    text not null,         -- markdown
  stats      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Ajan çalışmaları ----------
create table if not exists agent_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,        -- morning | tracker | backfill | chat
  status      text not null default 'running' check (status in ('running','ok','error','skipped')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  stats       jsonb not null default '{}'::jsonb,
  error       text
);

-- ---------- Senkron durumu ----------
create table if not exists sync_state (
  key        text primary key,      -- 'last_collect' | 'last_morning' ...
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------- Hafıza ----------
create table if not exists memories (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in
                   ('soul_core','soul','user','memory','lesson','person','project')),
  key              text,            -- kişi/proje adı gibi
  content          text not null,
  original_excerpt text,            -- önemli anılarda orijinal metin
  importance       smallint not null default 3 check (importance between 1 and 5),
  strength         real not null default 1.0,
  last_recalled_at timestamptz,
  source           jsonb,
  locked           boolean not null default false,  -- soul_core gibi değiştirilemez kayıtlar
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists memories_kind_idx on memories(kind, importance desc);

create table if not exists memory_versions (
  id         uuid primary key default gen_random_uuid(),
  memory_id  uuid not null references memories(id) on delete cascade,
  content    text not null,
  changed_at timestamptz not null default now()
);

create or replace function gunes_memory_version() returns trigger
language plpgsql as $$
begin
  if old.content is distinct from new.content then
    insert into memory_versions(memory_id, content) values (old.id, old.content);
  end if;
  return new;
end $$;

-- Kilitli hafıza (ruhun çekirdeği) değiştirilemez
create or replace function gunes_memory_guard() returns trigger
language plpgsql as $$
begin
  if old.locked and (tg_op = 'DELETE' or new.content is distinct from old.content) then
    raise exception 'Bu hafıza kaydı kilitli (ruhun çekirdeği). Sadece SQL Editor''den kilidi kaldırarak değiştirilebilir.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create table if not exists journal (
  id         uuid primary key default gen_random_uuid(),
  day        date not null default current_date,
  content    text not null,
  created_at timestamptz not null default now()
);

-- ---------- Sohbet ----------
create table if not exists chat_sessions (
  id                uuid primary key default gen_random_uuid(),
  claude_session_id uuid not null,
  title             text not null default 'Yeni sohbet',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  tools      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on chat_messages(session_id, created_at);

-- ---------- Tetikleyiciler ----------
drop trigger if exists projects_touch on projects;
create trigger projects_touch before update on projects for each row execute function gunes_touch_updated_at();
drop trigger if exists cards_touch on cards;
create trigger cards_touch before update on cards for each row execute function gunes_touch_updated_at();
drop trigger if exists memories_touch on memories;
create trigger memories_touch before update on memories for each row execute function gunes_touch_updated_at();
drop trigger if exists memories_version on memories;
create trigger memories_version before update on memories for each row execute function gunes_memory_version();
drop trigger if exists memories_guard on memories;
create trigger memories_guard before update or delete on memories for each row execute function gunes_memory_guard();
drop trigger if exists chat_sessions_touch on chat_sessions;
create trigger chat_sessions_touch before update on chat_sessions for each row execute function gunes_touch_updated_at();

-- ---------- RLS: açık, politika yok (sadece service_role) ----------
alter table projects        enable row level security;
alter table cards           enable row level security;
alter table card_activity   enable row level security;
alter table events          enable row level security;
alter table suggestions     enable row level security;
alter table briefings       enable row level security;
alter table agent_runs      enable row level security;
alter table sync_state      enable row level security;
alter table memories        enable row level security;
alter table memory_versions enable row level security;
alter table journal         enable row level security;
alter table chat_sessions   enable row level security;
alter table chat_messages   enable row level security;
