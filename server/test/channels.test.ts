import './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLevels, noiseFloor, ownLabel, rms } from '../src/meetings/channels.js';

test('yalnız mikrofon etkin: siz', () => assert.equal(classifyLevels(0.05, 0.001), 'user'));
test('yalnız karşı taraf etkin: karşı taraf', () => assert.equal(classifyLevels(0.002, 0.1), 'remote'));
test('ikisi de sessiz: silent', () => assert.equal(classifyLevels(0.001, 0.001), 'silent'));
test('ikisi de etkin: oran belirler', () => {
  assert.equal(classifyLevels(0.08, 0.03), 'user');
  assert.equal(classifyLevels(0.03, 0.09), 'remote');
  assert.equal(classifyLevels(0.05, 0.05), 'both');
});
test('mikrofona sızan hoparlör sesi (düşük oran) karşı taraf sayılır', () => assert.equal(classifyLevels(0.026, 0.092), 'remote'));
test('gürültü tabanı eşiği yükseltir', () => assert.equal(classifyLevels(0.01, 0.0, 0.01, 0), 'silent'));

test('rms ve gürültü tabanı', () => {
  assert.equal(rms(new Int16Array(100)), 0);
  const x = new Int16Array(16000 * 5).fill(0);
  for (let i = 16000 * 2; i < 16000 * 3; i++) x[i] = 8000;
  assert.ok(noiseFloor(x) < 0.001);
  assert.ok(rms(x, 16000 * 2, 16000 * 3) > 0.2);
});

test('ownLabel: tam ad tercih edilir', () => {
  assert.equal(ownLabel('Yıldıray', ['Ali Veli', 'Yıldıray Sürmen'], []), 'Yıldıray Sürmen');
  assert.equal(ownLabel('Yıldıray', ['Ali Veli'], []), 'Yıldıray');
  assert.equal(ownLabel('', ['Ali'], []), null);
});
