import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../src/config.js';
import { exceeds, JOB_TIER, thresholdFor } from '../src/usage.js';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const win = (utilization: number, resetsIn = 3600_000, status = 'allowed') => ({
  status: 'allowed',
  fiveHour: { utilization, resetsAt: new Date(NOW + resetsIn).toISOString(), status },
});

test('eşik altında ertelenmez, üstünde ertelenir', () => {
  assert.equal(exceeds(win(0.5), 0.7, NOW), false);
  assert.equal(exceeds(win(0.71), 0.7, NOW), true);
});

test('pencere sıfırlandıysa eski doluluk yok sayılır', () => {
  assert.equal(exceeds(win(0.99, -1000), 0.7, NOW), false);
});

test('veri yoksa ertelenmez', () => {
  assert.equal(exceeds(null, 0.7, NOW), false);
});

test('limit dolduysa (rejected) kritik eşikte bile ertelenir', () => {
  assert.equal(exceeds(win(0.2, 3600_000, 'rejected'), 1, NOW), true);
});

test('öncelik katmanları: kritik > normal > düşük', () => {
  assert.equal(thresholdFor('morning'), 1);
  assert.equal(thresholdFor('weekly'), 1);
  assert.equal(thresholdFor('tracker'), config.usagePauseAt);
  assert.ok(thresholdFor('backfill') <= thresholdFor('tracker'));
  assert.equal(JOB_TIER.reflection, 'low');
  assert.equal(JOB_TIER.followup, 'low');
});
