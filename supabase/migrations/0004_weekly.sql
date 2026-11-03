-- ============================================================
-- Güneş — 0004: Haftalık rapor ve haftalık iç gözlem brifingleri
-- SQL Editor'de bir kez çalıştırın.
-- ============================================================
alter table briefings drop constraint if exists briefings_kind_check;
alter table briefings add constraint briefings_kind_check
  check (kind in ('morning','tracker','weekly','reflection'));
