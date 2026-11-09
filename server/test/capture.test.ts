import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeArgs, parseHelperLine, type NativeInfo } from '../src/meetings/capture.js';

const info = (): NativeInfo => ({ meetingId: 'm', startedAt: 0, micOk: false, sysOk: 0, devices: [], error: null, fromCall: false, stopping: false });

test('yardımcı program satırları: cihazlar, mikrofon/çıkış durumu, READY/DONE', () => {
  const i = info();
  assert.equal(parseHelperLine('DEV|mikrofon|Mikrofon Dizisi (Intel)', i), null);
  assert.equal(parseHelperLine('DEV|cikis|Hoparlörler (Realtek)', i), null);
  assert.equal(parseHelperLine('OK|mic|48000 Hz, 2 kanal, 32 bit float', i), null);
  assert.equal(parseHelperLine('OK|sys-0|48000 Hz, 2 kanal, 32 bit float', i), null);
  assert.equal(parseHelperLine('OK|sys-1|44100 Hz, 2 kanal, 16 bit', i), null);
  assert.equal(parseHelperLine('READY', i), 'ready');
  assert.equal(parseHelperLine('DONE|42', i), 'done');
  assert.equal(i.micOk, true);
  assert.equal(i.sysOk, 2);
  assert.deepEqual(i.devices.map((d) => d.kind), ['mikrofon', 'cikis']);
  assert.equal(i.error, null);
});

test('mikrofon hatası: uyarı üretir ve micOk kapanır; çıkış hatası yalnızca ilkini saklar', () => {
  const i = info();
  parseHelperLine('OK|mic|48000 Hz', i);
  parseHelperLine('ERR|mic|InvalidCastException: ...', i);
  assert.equal(i.micOk, false);
  assert.match(i.error ?? '', /Mikrofon açılamadı/);
  assert.match(i.error ?? '', /Gizlilik/);
  const j = info();
  parseHelperLine('ERR|sys-0|Initialize 0x88890008', j);
  parseHelperLine('ERR|sys-1|başka', j);
  assert.match(j.error ?? '', /sys-0/);
  assert.doesNotMatch(j.error ?? '', /sys-1/);
});

test('birleştirme: mikrofon sol, karşı taraf sağ kanal; birden çok çıkış karıştırılır', () => {
  const a = mergeArgs({ mic: 'mic.raw', sys: ['sys-0.raw', 'sys-1.raw'] }, 'out.wav')!;
  const s = a.join(' ');
  assert.match(s, /-f s16le -ar 16000 -ac 1 -i mic\.raw/);
  assert.match(s, /-i sys-1\.raw/);
  assert.match(s, /\[1:a\]\[2:a\]amix=inputs=2:normalize=0\[s\]/);
  assert.match(s, /\[0:a\]\[s\]amerge=inputs=2\[a\]/);
  assert.equal(a[a.indexOf('-map') + 1], '[a]');
  assert.equal(a[a.length - 1], 'out.wav');
  const one = mergeArgs({ mic: 'mic.raw', sys: ['sys-0.raw'] }, 'o.wav')!.join(' ');
  assert.match(one, /\[0:a\]\[1:a\]amerge=inputs=2\[a\]/);
  assert.doesNotMatch(one, /amix/);
});

test('birleştirme: yalnızca mikrofon ya da yalnızca çıkış; hiç ses yoksa null', () => {
  const mic = mergeArgs({ mic: 'mic.raw', sys: [] }, 'o.wav')!;
  assert.equal(mic[mic.indexOf('-map') + 1], '0:a');
  assert.ok(!mic.includes('-filter_complex'));
  const sys = mergeArgs({ mic: null, sys: ['sys-0.raw'] }, 'o.wav')!;
  assert.equal(sys[sys.indexOf('-map') + 1], '0:a');
  const sys2 = mergeArgs({ mic: null, sys: ['sys-0.raw', 'sys-1.raw'] }, 'o.wav')!;
  assert.equal(sys2[sys2.indexOf('-map') + 1], '[s]');
  assert.equal(mergeArgs({ mic: null, sys: [] }, 'o.wav'), null);
});
