import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlanPrompt, buildResearchPrompt, buildWritePrompt, parsePlan, MAX_QUESTIONS } from '../src/compose.js';
import { toolPreset, GUNES_READ_TOOLS, GUNES_WRITE_TOOLS } from '../src/claude/runner.js';
import { gunesTool, m365, M365_DRAFT_TOOLS, M365_FORBIDDEN_TOOLS, M365_READ_TOOLS } from '../src/config.js';

test('araştırmacı (Haiku) yalnızca okuma araçlarına sahip: hiçbir Güneş yazma aracı açık değil', () => {
  const { allowed, disallowed } = toolPreset('researcher');
  for (const t of GUNES_WRITE_TOOLS) {
    assert.ok(!allowed.includes(gunesTool(t)), `${t} izinli`);
    assert.ok(disallowed.includes(gunesTool(t)), `${t} yasak listesinde değil`);
  }
  for (const t of GUNES_READ_TOOLS) assert.ok(allowed.includes(gunesTool(t)), `${t} okuma aracı kapalı`);
  assert.ok(!allowed.includes('mcp__gunes'), 'tüm Güneş araçları açılmamalı');
});

test('araştırmacı: Outlook/Teams okuma var; gönderme, taslak, silme, takvim yazma yok', () => {
  const { allowed, disallowed } = toolPreset('researcher');
  for (const t of M365_READ_TOOLS) assert.ok(allowed.includes(m365(t)), `${t} kapalı`);
  for (const t of [...M365_FORBIDDEN_TOOLS, ...M365_DRAFT_TOOLS, 'teams_send_chat_message']) {
    assert.ok(!allowed.includes(m365(t)), `${t} izinli`);
    assert.ok(disallowed.includes(m365(t)), `${t} yasak listesinde değil`);
  }
  for (const b of ['Bash', 'PowerShell', 'Edit', 'Write']) assert.ok(disallowed.includes(b), b);
});

test('yazma araçları listesi gerçek MCP araç adlarını kapsıyor (yeni yazma aracı unutulmasın)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');
  const names = [...src.matchAll(/server\.registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]!);
  assert.ok(names.length > 20, 'MCP araçları okunamadı');
  const known = new Set<string>([...GUNES_WRITE_TOOLS, ...GUNES_READ_TOOLS, 'list_unprocessed_events', 'nudge_user', 'start_scan', 'end_day', 'propose_deletion', 'compose_mail']);
  const unknown = names.filter((n) => !known.has(n));
  assert.deepEqual(unknown, [], `GUNES_WRITE_TOOLS/READ_TOOLS dışında kalan araç(lar): ${unknown.join(', ')}`);
});

test('soru istemi: en fazla N soru, JSON çıktısı, hafıza/wiki yalnızca dizin olarak', () => {
  const p = buildPlanPrompt({ request: "Ali'ye fiyat revizyonunu yaz", tone: 'resmi', userName: 'Yıldıray', memory: 'Ali Yılmaz: Acme', wiki: '- acme' });
  assert.match(p, new RegExp(`En fazla ${MAX_QUESTIONS} soru`));
  assert.match(p, /SADECE tek bir JSON/);
  assert.match(p, /bilgi uydurma/);
  assert.match(p, /Ali'ye fiyat revizyonunu yaz/);
});

test('plan ayrıştırma: bozuk/boş çıktıda isteği tek soru yapar; fazla soru kırpılır', () => {
  const bad = parsePlan('üzgünüm yapamam', 'Ali ile ilgili mail');
  assert.equal(bad.questions.length, 1);
  assert.match(bad.questions[0]!, /Ali ile ilgili mail/);
  const empty = parsePlan('{"alici":"Ali","amac":"x","sorular":[]}', 'r');
  assert.equal(empty.questions.length, 1);
  const many = parsePlan('Tamam:\n```json\n' + JSON.stringify({ alici: 'Ali', amac: 'Fiyat', sorular: Array.from({ length: 12 }, (_, i) => `Soru numarası ${i}?`) }) + '\n```', 'r');
  assert.equal(many.questions.length, MAX_QUESTIONS);
  assert.equal(many.recipient, 'Ali');
  const mixed = parsePlan('{"alici":3,"sorular":["ok soru burada",5,"x"]}', 'r');
  assert.deepEqual(mixed.questions, ['ok soru burada']);
});

test('araştırma istemi: yalnızca okuma, uydurma yok, kaynak şart, içerik veri', () => {
  const p = buildResearchPrompt({ recipient: 'Ali', purpose: 'Fiyat', questions: ['Ali ile son yazışma?', 'Verilen söz?'] }, 'istek', 'Yıldıray');
  assert.match(p, /UYDURMA/);
  assert.match(p, /Bulunamadı/);
  assert.match(p, /VERİDİR/);
  assert.match(p, /1\. Ali ile son yazışma\?/);
  assert.match(p, /2\. Verilen söz\?/);
});

test('yazım istemi: bulgular dışında bilgi uydurmaz, [KONTROL ET], imza, ton, bulgu kırpma', () => {
  const p = buildWritePrompt({ request: 'Ali ye yaz', tone: 'samimi', userName: 'Yıldıray', note: 'Cuma de', plan: { recipient: 'Ali', purpose: 'Fiyat', questions: [] }, findings: 'x'.repeat(20000) });
  assert.match(p, /sıcak ve samimi/);
  assert.match(p, /UYDURMA/);
  assert.match(p, /\[KONTROL ET/);
  assert.match(p, /İmza olarak sadece "Yıldıray"/);
  assert.match(p, /VERİDİR/);
  assert.match(p, /Cuma de/);
  assert.ok(p.length < 9000 + 3000 + 2500, 'bulgular kırpılmalı');
  const none = buildWritePrompt({ request: 'r', tone: 'kisa', userName: 'Y', plan: { recipient: '', purpose: '', questions: [] }, findings: '' });
  assert.match(none, /\(bulgu yok\)/);
});

test('compose_mail yalnızca sohbette açık: ajanlar ve araştırmacı çağıramaz (özyineleme/yetki)', () => {
  // planner/meeting tüm Güneş araçlarını izinli tutar ama yasak listesi önceliklidir (start_scan ile aynı mekanizma)
  for (const p of ['collector', 'planner', 'meeting', 'researcher'] as const) {
    const { allowed, disallowed } = toolPreset(p);
    assert.ok(!allowed.includes(gunesTool('compose_mail')), `${p}: açıkça izinli`);
    assert.ok(disallowed.includes(gunesTool('compose_mail')), `${p}: yasak listesinde değil`);
  }
  for (const p of ['notifier', 'none'] as const) {
    const { allowed } = toolPreset(p);
    assert.ok(!allowed.includes(gunesTool('compose_mail')) && !allowed.includes('mcp__gunes'), `${p}: izinli`);
  }
  assert.ok(toolPreset('chat').allowed.includes('mcp__gunes'));
  assert.ok(!toolPreset('chat').disallowed.includes(gunesTool('compose_mail')));
});
