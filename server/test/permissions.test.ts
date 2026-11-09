import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunesTool, m365, M365_DRAFT_TOOLS, M365_FORBIDDEN_TOOLS, M365_READ_TOOLS } from '../src/config.js';
import { toolPreset, type ToolPreset } from '../src/claude/runner.js';

/** Bu liste DARALTILAMAZ: Güneş asla göndermez/silmez/takvimi değiştirmez (CLAUDE.md). */
const MUST_STAY_FORBIDDEN = [
  'outlook_send_mail',
  'outlook_send_draft',
  'outlook_forward_mail',
  'outlook_batch_delete_messages',
  'outlook_trash_thread',
  'outlook_delete_event',
  'outlook_create_event',
  'outlook_update_event',
  'outlook_respond_to_event',
  'teams_send_channel_message',
  'teams_reply_channel_message',
  'teams_create_chat',
  'sharepoint_delete_item',
  'sharepoint_upload_file',
];

test('yasak M365 araç listesi daraltılmamış', () => {
  for (const t of MUST_STAY_FORBIDDEN) assert.ok(M365_FORBIDDEN_TOOLS.includes(t), `${t} yasak listesinden çıkarılmış`);
});

test('okuma/taslak listeleri yasak araç içermez', () => {
  for (const t of [...M365_READ_TOOLS, ...M365_DRAFT_TOOLS]) assert.ok(!M365_FORBIDDEN_TOOLS.includes(t), `${t} hem izinli hem yasak`);
});

const PRESETS: ToolPreset[] = ['collector', 'planner', 'meeting', 'researcher', 'chat', 'notifier', 'none'];

test('hiçbir ön ayar yasak bir M365 aracına izin vermez', () => {
  for (const p of PRESETS) {
    const { allowed, disallowed } = toolPreset(p);
    for (const t of M365_FORBIDDEN_TOOLS) {
      assert.ok(!allowed.includes(m365(t)), `${p}: ${t} izinli`);
      assert.ok(disallowed.includes(m365(t)), `${p}: ${t} yasak listesinde değil`);
    }
  }
});

test('hiçbir ön ayar kabuk/dosya yazma araçlarına izin vermez', () => {
  for (const p of PRESETS) {
    const { allowed, disallowed } = toolPreset(p);
    for (const t of ['Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit']) {
      assert.ok(!allowed.includes(t), `${p}: ${t} izinli`);
      assert.ok(disallowed.includes(t), `${p}: ${t} yasakta değil`);
    }
  }
});

test('Teams sohbet mesajı gönderme sadece notifier ön ayarında açık', () => {
  for (const p of PRESETS) {
    const open = toolPreset(p).allowed.includes(m365('teams_send_chat_message'));
    assert.equal(open, p === 'notifier', p);
  }
});

test('taslak araçları sadece sohbette açık', () => {
  for (const p of PRESETS) {
    const open = M365_DRAFT_TOOLS.every((t) => toolPreset(p).allowed.includes(m365(t)));
    assert.equal(open, p === 'chat', p);
  }
});

test('tarama başlatma / silme önerme ajan ön ayarlarında kapalı', () => {
  for (const p of ['collector', 'planner', 'meeting'] as const) {
    const { disallowed } = toolPreset(p);
    for (const t of ['start_scan', 'propose_deletion', 'end_day']) assert.ok(disallowed.includes(gunesTool(t)), `${p}: ${t}`);
  }
});
