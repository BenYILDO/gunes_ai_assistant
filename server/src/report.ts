/**
 * Rapor dışa aktarma: brifing/haftalık rapor → Markdown dosyası.
 * Haftalık rapor yazılınca data/wiki/raporlar/ altına (Obsidian ile açılır) ve istenirse
 * GUNES_REPORT_DIR klasörüne (ör. OneDrive) otomatik kaydedilir.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { WIKI_DIR } from './wiki.js';
import type { Briefing } from './store/index.js';

/** ISO hafta anahtarı (ör. 2026-W45); yerel takvim gününe göre. */
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

const TITLE: Record<Briefing['kind'], string> = {
  weekly: 'Haftalık Rapor',
  morning: 'Sabah Brifingi',
  tracker: 'Gün İçi Güncelleme',
  reflection: 'Haftalık İç Gözlem',
};
const STAT_TR: Record<string, string> = {
  urgent: 'Öncelikli',
  awaiting_my_reply: 'Cevap bekleyen',
  waiting_on_others: 'Beklediğiniz',
  new_cards: 'Yeni kart',
  updated_cards: 'Güncellenen kart',
  meetings_today: 'Toplantı',
};

const trDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: config.timezone });

export function reportFilename(b: Briefing) {
  const d = new Date(b.created_at);
  const slug = { weekly: 'haftalik-rapor', morning: 'sabah-brifing', tracker: 'guncelleme', reflection: 'ic-gozlem' }[b.kind];
  const stamp = b.kind === 'weekly' || b.kind === 'reflection' ? isoWeek(d) : d.toISOString().slice(0, 10);
  return `${slug}-${stamp}.md`;
}

export function briefingToMarkdown(b: Briefing, who = config.userName) {
  const d = new Date(b.created_at);
  const stats = Object.entries(b.stats ?? {}).filter(([, v]) => typeof v === 'number' && v > 0);
  const front = ['---', `tür: ${b.kind}`, `tarih: ${b.created_at}`, ...(b.kind === 'weekly' || b.kind === 'reflection' ? [`hafta: ${isoWeek(d)}`] : []), `hazırlayan: Güneş (${who} için)`, '---'];
  return [
    front.join('\n'),
    '',
    `# ${TITLE[b.kind]} — ${trDate(d)}`,
    '',
    `> ${b.headline}`,
    '',
    b.content.trim(),
    ...(stats.length ? ['', '## Sayılarla', '', '| Gösterge | Değer |', '| --- | --- |', ...stats.map(([k, v]) => `| ${STAT_TR[k] ?? k} | ${v} |`)] : []),
    '',
    '---',
    '_Güneş tarafından hazırlandı._',
    '',
  ].join('\n');
}

/** Raporu klasörlere yazar; yazılan dosya yollarını döner (hata olursa sessizce atlar). */
export function saveReport(b: Briefing) {
  const name = reportFilename(b);
  const md = briefingToMarkdown(b);
  const written: string[] = [];
  for (const dir of [join(WIKI_DIR, 'raporlar'), config.reportDir].filter(Boolean)) {
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const f = join(dir, name);
      writeFileSync(f, md, 'utf8');
      written.push(f);
    } catch (e) {
      console.error(`[güneş] Rapor yazılamadı (${dir}):`, (e as Error).message);
    }
  }
  return written;
}
