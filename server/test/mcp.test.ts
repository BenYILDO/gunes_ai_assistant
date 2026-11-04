import { TEST_DATA_DIR } from './env.js';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT } from '../src/config.js';
import { getStore } from '../src/store/index.js';
import { ensureSoul } from '../src/agents/soul.js';

/** Gerçek Güneş MCP sunucusunu (stdio) başlatıp güvenlik kurallarını uçtan uca dener. */
let client: Client;
let doneCardId = '';
let openCardId = '';

type Result = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (name: string, args: Record<string, unknown> = {}) => {
  try {
    const r = (await client.callTool({ name, arguments: args })) as Result;
    return { error: Boolean(r.isError), text: r.content.map((c) => c.text).join('\n') };
  } catch (e) {
    // Şema doğrulaması (ör. enum dışı değer) JSON-RPC hatası olarak döner
    return { error: true, text: (e as Error).message };
  }
};

before(async () => {
  // Sunucu başlamadan önce örnek veriyi aynı yerel depoya yaz
  const store = getStore();
  await ensureSoul(store);
  const done = await store.createCard({ title: 'Kapanmış iş', status: 'done', closed_at: new Date().toISOString() });
  const open = await store.createCard({ title: 'Açık iş', status: 'doing' });
  doneCardId = done.id;
  openCardId = open.id;

  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(ROOT, 'server', 'src', 'mcp.ts')],
      cwd: ROOT,
      env: { ...(process.env as Record<string, string>), GUNES_DATA_DIR: TEST_DATA_DIR, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
      stderr: 'ignore',
    }),
  );
});

after(async () => {
  await client?.close();
});

test('araç listesinde mail/mesaj gönderme aracı yok', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(names.includes('move_card') && names.includes('create_card'));
  for (const n of names) assert.doesNotMatch(n, /send|forward|delete_card|delete_event/, n);
});

test("ajan kartı 'done' yapamaz (şema reddeder)", async () => {
  const r = await call('move_card', { id: openCardId, status: 'done', reason: 'bitti' });
  assert.equal(r.error, true);
  const card = await getStore().getCard(openCardId);
  assert.notEqual(card?.status, 'done');
});

test("create_card 'done' durumuyla kart açamaz", async () => {
  const r = await call('create_card', { title: 'Direkt bitmiş kart', status: 'done' });
  assert.equal(r.error, true);
});

test("review'e taşıma çalışır ve gerekçe kaydedilir", async () => {
  const r = await call('move_card', { id: openCardId, status: 'review', reason: 'Müşteri onayladı' });
  assert.equal(r.error, false, r.text);
  const card = await getStore().getCard(openCardId);
  assert.equal(card?.status, 'review');
  assert.equal(card?.close_reason, 'Müşteri onayladı');
});

test('kullanıcının kapattığı kart yeniden açılamaz', async () => {
  const r = await call('move_card', { id: doneCardId, status: 'todo', reason: 'tekrar açıyorum' });
  assert.equal(r.error, true);
  assert.equal((await getStore().getCard(doneCardId))?.status, 'done');
});

test('kilitli hafıza (ruh çekirdeği) değiştirilemez ve silinmesi önerilemez', async () => {
  const core = (await getStore().listMemories(['soul_core']))[0];
  assert.ok(core?.locked, 'soul_core kaydı kilitli olmalı');
  const before = core.content;
  const upd = await call('update_memory', { id: core.id.slice(0, 8), content: 'ele geçirildi' });
  assert.equal(upd.error, true);
  const del = await call('propose_deletion', { target: 'memory', id: core.id.slice(0, 8), reason: 'gereksiz' });
  assert.equal(del.error, true);
  const after = (await getStore().listMemories(['soul_core'])).find((m) => m.id === core.id);
  assert.equal(after?.content, before);
  assert.equal((await getStore().listPendingActions('pending')).length, 0);
});

test('silme sadece öneri olarak kaydedilir; kart silinmez', async () => {
  const r = await call('propose_deletion', { target: 'card', id: openCardId.slice(0, 8), reason: 'tekrar kart' });
  assert.equal(r.error, false, r.text);
  assert.ok(await getStore().getCard(openCardId), 'kart hâlâ var olmalı');
  const pending = await getStore().listPendingActions('pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].action, 'delete_card');
});

test('record_events aynı olayı iki kez eklemez', async () => {
  const ev = { source: 'outlook', external_id: 'x-1', occurred_at: new Date().toISOString(), summary: 'Test olayı' };
  const a = await call('record_events', { events: [ev] });
  const b = await call('record_events', { events: [ev] });
  assert.match(a.text, /1 yeni/);
  assert.match(b.text, /0 yeni/);
});
