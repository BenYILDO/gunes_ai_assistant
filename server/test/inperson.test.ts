import './env.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { startLiveMeeting } from '../src/meetings/live.js';
import { isInPerson, meetingDir, removeMeetingFiles } from '../src/meetings/pipeline.js';
import { mergeArgs } from '../src/meetings/capture.js';

test('yüz yüze toplantı: varsayılan ad, katılımcılar kırpılıp kaydedilir, işaret dosyası yazılır', async () => {
  const { meeting } = await startLiveMeeting({ inPerson: true, native: false, attendees: ['  Ali Veli ', '', 'Ayşe Kaya', 'x'.repeat(200)] });
  assert.equal(meeting.title, 'Yüz yüze toplantı');
  assert.equal(meeting.status, 'recording');
  assert.equal(meeting.attendees[0], 'Ali Veli');
  assert.equal(meeting.attendees[1], 'Ayşe Kaya');
  assert.equal(meeting.attendees[2]!.length, 80);
  assert.equal(meeting.attendees.length, 3); // boş ad atılır
  assert.equal(isInPerson(meeting.id), true);
  removeMeetingFiles(meeting.id);
  assert.equal(isInPerson(meeting.id), false); // silinince işaret de gider
});

test('çevrimiçi canlı toplantı yüz yüze sayılmaz (kanal tabanlı kendi-ses etiketi çalışmaya devam eder)', async () => {
  const { meeting } = await startLiveMeeting({ title: 'Arama', native: false });
  assert.equal(meeting.title, 'Arama');
  assert.equal(isInPerson(meeting.id), false);
  assert.equal(existsSync(meetingDir(meeting.id)), true);
  removeMeetingFiles(meeting.id);
});

test('yüz yüze: yakalama betiği -NoSys alır; çevrimiçi dinlemede almaz; mikrofon-tek birleştirme tek kanal', () => {
  const src = readFileSync(new URL('../src/meetings/capture.ts', import.meta.url), 'utf8');
  assert.match(src, /if \(opts\.inPerson\) args\.push\('-NoSys'\)/);
  const ps = readFileSync(new URL('../../scripts/windows/ses-yakala.ps1', import.meta.url), 'utf8');
  assert.match(ps, /\[switch\]\$NoSys/);
  assert.match(ps, /if \(!noSys\) foreach \(var d in Active\(en, 0\)\)/); // hoparlör (loopback) yalnız -NoSys yoksa yakalanır
  const a = mergeArgs({ mic: 'mic-0.raw', sys: [] }, 'capture.wav')!;
  assert.ok(!a.includes('-filter_complex')); // stereo amerge yok
  assert.equal(a[a.indexOf('-map') + 1], '0:a');
});

test('yüz yüzede kanal tabanlı "kendi ses" sınıflaması atlanır (tek mikrofonda herkes "mikrofon baskın" görünürdü)', () => {
  const src = readFileSync(new URL('../src/meetings/pipeline.ts', import.meta.url), 'utf8');
  assert.match(src, /capture\\\.wav\$\/i\.test\(m0\.audio_file\) && !isInPerson\(id\)/);
});
