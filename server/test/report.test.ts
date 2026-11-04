import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefingToMarkdown, isoWeek, reportFilename } from '../src/report.js';
import type { Briefing } from '../src/store/index.js';

const weekly: Briefing = { id: 'b1', kind: 'weekly', headline: 'Verimli bir hafta oldu', content: '## Kapananlar\n- A işi', stats: { new_cards: 4, urgent: 0, meetings_today: 2 }, created_at: '2026-11-06T13:30:00.000Z' };

test('isoWeek: yıl sınırlarında doğru hafta', () => {
  assert.equal(isoWeek(new Date(2026, 10, 6)), '2026-W45');
  assert.equal(isoWeek(new Date(2026, 0, 1)), '2026-W01');
  assert.equal(isoWeek(new Date(2024, 11, 30)), '2025-W01');
});

test('dosya adı tür ve haftaya göre', () => {
  assert.equal(reportFilename(weekly), 'haftalik-rapor-2026-W45.md');
  assert.equal(reportFilename({ ...weekly, kind: 'morning' }), 'sabah-brifing-2026-11-06.md');
});

test('markdown: başlık, özet, içerik ve sıfır olmayan sayılar', () => {
  const md = briefingToMarkdown(weekly, 'Yıldıray');
  assert.match(md, /^---\ntür: weekly/);
  assert.match(md, /hafta: 2026-W45/);
  assert.match(md, /# Haftalık Rapor — 6 Kasım 2026/);
  assert.match(md, /> Verimli bir hafta oldu/);
  assert.match(md, /## Kapananlar/);
  assert.match(md, /\| Yeni kart \| 4 \|/);
  assert.doesNotMatch(md, /Öncelikli/); // 0 olanlar yazılmaz
});
