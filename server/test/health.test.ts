import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hintFor, runProblems } from '../src/health.js';
import type { AgentRun } from '../src/store/index.js';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const run = (kind: string, status: AgentRun['status'], minsAgo: number, error: string | null = null): AgentRun => {
  const t = new Date(NOW - minsAgo * 60_000).toISOString();
  return { id: `${kind}-${minsAgo}`, kind, status, started_at: t, finished_at: status === 'running' ? null : t, stats: {}, error };
};

test('son çalışması hata olan iş "sorun" sayılır', () => {
  const p = runProblems([run('tracker', 'error', 10, 'fetch failed'), run('tracker', 'ok', 200)], { now: NOW });
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, 'tracker');
  assert.equal(p[0].retryable, true);
});

test('sonraki başarılı çalışma sorunu kapatır', () => {
  const p = runProblems([run('tracker', 'error', 200, 'x'), run('tracker', 'ok', 10)], { now: NOW });
  assert.deepEqual(p, []);
});

test('atlanan/çalışan kayıtlar hatayı kapatmaz ya da açmaz', () => {
  assert.equal(runProblems([run('morning', 'error', 300, 'x'), run('morning', 'running', 1)], { now: NOW }).length, 1);
  assert.equal(runProblems([run('morning', 'skipped', 5)], { now: NOW }).length, 0);
});

test('eski hatalar (36 saatten eski) gösterilmez; toplantı işleri yeniden denenemez', () => {
  assert.equal(runProblems([run('wiki', 'error', 60 * 40, 'x')], { now: NOW }).length, 0);
  assert.equal(runProblems([run('prep', 'error', 5, 'x')], { now: NOW })[0].retryable, false);
});

test('hata metninden ipucu üretir', () => {
  assert.match(hintFor('Claude oturum açık değil: login required') ?? '', /giriş/);
  assert.match(hintFor('rate limit reached') ?? '', /limit/);
  assert.match(hintFor('Toplayıcı hatası: timeout') ?? '', /zaman aşımı/);
  assert.equal(hintFor('tamamen farklı bir şey'), null);
});

import { configProblems } from '../src/health.js';

const good = {
  schedule: { morningTime: '08:30', workEnd: '18:00', trackerEveryHours: 2, workDays: [1, 2, 3, 4, 5] },
  weeklyDay: 5,
  weeklyTime: '16:30',
  usagePauseAt: 0.85,
  usageDeferAt: 0.7,
  port: 4317,
  backfillDays: 45,
};

test('geçerli ayarlarda sorun yok', () => assert.deepEqual(configProblems(good), []));

test('hatalı ayarlar yakalanır', () => {
  assert.equal(configProblems({ ...good, schedule: { ...good.schedule, morningTime: '8:30' } }).length, 1);
  assert.match(configProblems({ ...good, weeklyDay: 6 }).join(), /çalışma günlerinde değil/);
  assert.match(configProblems({ ...good, usageDeferAt: 0.9 }).join(), /büyük olmamalı/);
  assert.match(configProblems({ ...good, usagePauseAt: 85 }).join(), /0 ile 1/);
  assert.match(configProblems({ ...good, schedule: { ...good.schedule, workDays: [0, 9] } }).join(), /WORK_DAYS/);
});
