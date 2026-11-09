import test from 'node:test';
import assert from 'node:assert/strict';
import { contextLines, pickFrom, pickLine, type PetCtx } from '../src/lib/pet.ts';

const base: PetCtx = { name: 'Tarçın', mood: 'happy', fedToday: true, streak: 0, hour: 15, nextMeetingMins: null, nextMeetingTitle: null, critical: 0 };

test('toplantıya az kala hatırlatır', () => {
  assert.match(contextLines({ ...base, nextMeetingMins: 5, nextMeetingTitle: 'Daily Scrum' })[0]!, /Daily Scrum 5 dk sonra/);
  assert.match(contextLines({ ...base, nextMeetingMins: 20 })[0]!, /hazırlık notuna/);
  assert.equal(contextLines({ ...base, nextMeetingMins: 90 }).some((l) => /toplantı|dk sonra/i.test(l)), false);
});
test('aç ve gün başlamışsa mama ister; sabah erken istemez', () => {
  assert.ok(contextLines({ ...base, fedToday: false, hour: 11 }).some((l) => /acıktı/.test(l)));
  assert.equal(contextLines({ ...base, fedToday: false, hour: 7 }).some((l) => /acıktı/.test(l)), false);
});
test('seri ve öncelikli iş cümleleri', () => {
  assert.ok(contextLines({ ...base, streak: 5 }).some((l) => /5 gündür/.test(l)));
  assert.ok(contextLines({ ...base, critical: 2 }).some((l) => /2 öncelikli/.test(l)));
});
test('pickLine: önceki cümleyi tekrarlamaz, her zaman bir cümle döner', () => {
  let last: string | null = null;
  for (let i = 0; i < 200; i++) {
    const l = pickLine({ ...base, critical: 1 }, Math.random, last);
    assert.ok(l.length > 0);
    assert.notEqual(l, last);
    last = l;
  }
});
test('pickLine: rnd sabitken belirli havuzdan seçer', () => {
  assert.match(pickLine({ ...base, critical: 3 }, () => 0), /3 öncelikli/);
  assert.equal(pickFrom(['a', 'b'], () => 0.99), 'b');
});
