/**
 * Zaman raporu: npm run timing  (son 24 saat; `npm run timing -- 72` → son 72 saat)
 * data/timing.log içindeki Claude turlarını ve Güneş araç sürelerini özetler.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.js';

const file = join(DATA_DIR, 'timing.log');
if (!existsSync(file)) {
  console.log('Henüz zaman kaydı yok (data/timing.log).');
  process.exit(0);
}
const hours = Number(process.argv[2] ?? 24);
const since = Date.now() - hours * 3600_000;
const rows = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter((r) => r && new Date(r.at).getTime() >= since);

const s = (ms: number) => `${(ms / 1000).toFixed(1)} sn`;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

console.log(`\n☀️  Güneş zaman raporu — son ${hours} saat\n`);

const turns = rows.filter((r) => r.src === 'claude');
const byPreset = new Map<string, any[]>();
for (const t of turns) byPreset.set(t.preset, [...(byPreset.get(t.preset) ?? []), t]);
console.log('Claude turları (iş türüne göre):');
for (const [p, list] of byPreset)
  console.log(
    `  ${p.padEnd(10)} ${String(list.length).padStart(4)} tur · ort. ${s(avg(list.map((t) => t.total_ms)))} · açılış ort. ${s(avg(list.map((t) => t.init_ms)))} · ort. ${Math.round(avg(list.map((t) => t.out_tokens)))} çıktı tokenı`,
  );

const toolMap = new Map<string, number[]>();
for (const t of turns) for (const x of t.tools ?? []) toolMap.set(x.name, [...(toolMap.get(x.name) ?? []), x.ms]);
console.log('\nAraç süreleri (modelin araç girdisini bitirmesinden sonucun dönmesine kadar):');
for (const [n, ms] of [...toolMap].sort((a, b) => avg(b[1]) - avg(a[1])))
  console.log(`  ${n.padEnd(28)} ${String(ms.length).padStart(4)}× · ort. ${s(avg(ms))} · en uzun ${s(Math.max(...ms))}`);

const db = rows.filter((r) => r.src === 'mcp');
const dbMap = new Map<string, number[]>();
for (const r of db) dbMap.set(r.tool, [...(dbMap.get(r.tool) ?? []), r.ms]);
if (dbMap.size) {
  console.log(`\nGüneş araçlarının veritabanı süresi (${db[0]?.store ?? '?'}):`);
  for (const [n, ms] of [...dbMap].sort((a, b) => avg(b[1]) - avg(a[1])))
    console.log(`  ${n.padEnd(28)} ${String(ms.length).padStart(4)}× · ort. ${Math.round(avg(ms))} ms · en uzun ${Math.max(...ms)} ms`);
}

console.log('\nEn yavaş 5 tur:');
for (const t of [...turns].sort((a, b) => b.total_ms - a.total_ms).slice(0, 5))
  console.log(
    `  ${t.at.slice(0, 16).replace('T', ' ')} · ${t.preset} · ${s(t.total_ms)} · ${t.out_tokens} token · ${(t.tools ?? []).map((x: any) => `${x.name} ${s(x.ms)}`).join(', ') || '-'}`,
  );
console.log('');
