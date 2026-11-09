-- ============================================================
-- Güneş — 0006: Toplantılar (kayıt → transkript → konuşmacı) ve ses profilleri
-- SQL Editor'de bir kez çalıştırın. Çalıştırılmazsa Güneş'in geri kalanı yine çalışır;
-- sadece "Toplantılar" paneli kayıt yapamaz.
--
-- UYARI — voice_profiles BİYOMETRİK kişisel veridir (KVKK'da özel nitelikli kişisel veri).
-- Bir kişinin ses profili o kişinin aydınlatılması / açık rızası ya da kurumsal politika gerektirebilir.
-- Güneş panelinde her profil kişi başı silinebilir (Toplantılar → Ses profilleri).
-- Ses dosyaları Supabase'e GİTMEZ; yalnızca bu bilgisayarın data/meetings klasöründe kalır.
-- ============================================================

create table if not exists voice_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,            -- görünen ad (ör. "Yıldıray Sürmen")
  embedding   jsonb not null,                  -- konuşmacı vektörü (merkez), sayı dizisi
  model       text not null,                   -- vektörü üreten model dosyası (uyumluluk için)
  samples     integer not null default 1,      -- profile katılan satır sayısı
  source      text not null default 'manual' check (source in ('teams','manual','live')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists meetings (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  source             text not null default 'upload' check (source in ('upload','folder','live')),
  status             text not null default 'queued' check (status in ('recording','queued','processing','review','done','error')),
  step               text not null default '',
  started_at         timestamptz,
  duration_sec       integer,
  event_external_id  text,                     -- takvim etkinliği (events.external_id)
  attendees          jsonb not null default '[]'::jsonb,
  project_slug       text,
  wiki_slug          text,
  audio_file         text,                     -- yerel dosya yolu (yalnız bu bilgisayarda)
  transcript         jsonb not null default '[]'::jsonb,
  speakers           jsonb not null default '[]'::jsonb,
  summary            text,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists meetings_started_idx on meetings(started_at desc);

drop trigger if exists voice_profiles_touch on voice_profiles;
create trigger voice_profiles_touch before update on voice_profiles for each row execute function gunes_touch_updated_at();
drop trigger if exists meetings_touch on meetings;
create trigger meetings_touch before update on meetings for each row execute function gunes_touch_updated_at();

alter table voice_profiles enable row level security;
alter table meetings       enable row level security;
