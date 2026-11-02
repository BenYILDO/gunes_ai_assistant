-- ============================================================
-- Güneş — 0003: Kimden geldi, konuşma dizileri, bağlama onayı, Wiki
-- SQL Editor'de bir kez çalıştırın (0001 ve 0002'den sonra).
-- ============================================================

-- İşi kim istedi / kimden geldi
alter table cards add column if not exists requested_by text;
-- Kartın bağlı olduğu wiki sayfası (genelde proje sayfası)
alter table cards add column if not exists wiki_slug text;

-- Olaylar: kullanıcının kendi mesajı mı, hangi konuşma dizisine ait
alter table events add column if not exists from_me boolean not null default false;
alter table events add column if not exists thread_id text;
create index if not exists events_thread_idx on events(thread_id);

-- Onay bekleyen eylemlere "bu olay şu karta mı ait?" sorusu
alter table pending_actions drop constraint if exists pending_actions_action_check;
alter table pending_actions add constraint pending_actions_action_check
  check (action in ('delete_card','delete_memory','confirm_link'));
alter table pending_actions add column if not exists payload jsonb not null default '{}'::jsonb;

-- ---------- Wiki (Karpathy LLM Wiki deseni) ----------
-- Ham kaynaklar = events (değişmez). Wiki = Güneş'in yazıp güncellediği sayfalar.
create table if not exists wiki_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,          -- dosya adı gibi: edi-gecisi, bahadir-bey
  title      text not null,
  kind       text not null default 'topic' check (kind in ('project','person','topic','thread','overview')),
  summary    text not null default '',      -- index'te görünen tek satır
  content    text not null default '',      -- markdown, [[slug]] bağlantılı
  links      text[] not null default '{}',  -- içerikteki [[slug]] bağlantıları
  sources    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wiki_versions (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references wiki_pages(id) on delete cascade,
  content    text not null,
  changed_at timestamptz not null default now()
);

create or replace function gunes_wiki_version() returns trigger
language plpgsql as $$
begin
  if old.content is distinct from new.content then
    insert into wiki_versions(page_id, content) values (old.id, old.content);
  end if;
  return new;
end $$;

drop trigger if exists wiki_touch on wiki_pages;
create trigger wiki_touch before update on wiki_pages for each row execute function gunes_touch_updated_at();
drop trigger if exists wiki_version on wiki_pages;
create trigger wiki_version before update on wiki_pages for each row execute function gunes_wiki_version();

-- Bir mail dizisi / Teams sohbeti ↔ wiki sayfası (ve isteğe bağlı kart) bağı.
-- Bağlı bir diziye gelen her yeni mesaj otomatik olarak o projeye işlenir.
create table if not exists thread_links (
  thread_id  text primary key,
  source     text not null default 'outlook',
  page_slug  text references wiki_pages(slug) on update cascade on delete set null,
  card_id    uuid references cards(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

alter table wiki_pages    enable row level security;
alter table wiki_versions enable row level security;
alter table thread_links  enable row level security;
