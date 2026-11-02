/**
 * Wiki yardımcıları (Karpathy "LLM Wiki" deseni).
 *  - Ham kaynaklar: events (değişmez)
 *  - Wiki: Güneş'in yazdığı, [[slug]] ile birbirine bağlı sayfalar (Supabase'de)
 *  - index.md / log.md: data/wiki/ altına Obsidian ile açılabilir kopya olarak yazılır
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.js';
import type { Store, WikiPage } from './store/index.js';

const TR: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };

export function slugify(s: string) {
  return s
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function extractLinks(md: string) {
  return [...new Set([...md.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => slugify(m[1])))];
}

export const WIKI_DIR = join(DATA_DIR, 'wiki');

const KIND_TR: Record<string, string> = {
  overview: 'Genel bakış',
  project: 'Projeler',
  person: 'Kişiler',
  topic: 'Konular',
  thread: 'Yazışmalar',
};

/** Wiki'yi Obsidian ile açılabilecek markdown klasörüne yazar (data/wiki). Asıl kaynak veritabanıdır. */
export async function exportWiki(store: Store) {
  try {
    const pages = await store.listWikiPages();
    if (!existsSync(WIKI_DIR)) mkdirSync(WIKI_DIR, { recursive: true });
    const keep = new Set(['index.md', 'log.md', ...pages.map((p) => `${p.slug}.md`)]);
    for (const f of readdirSync(WIKI_DIR)) if (f.endsWith('.md') && !keep.has(f)) rmSync(join(WIKI_DIR, f));

    for (const p of pages) writeFileSync(join(WIKI_DIR, `${p.slug}.md`), pageMarkdown(p, pages));

    const groups = Object.keys(KIND_TR)
      .map((k) => {
        const list = pages.filter((p) => p.kind === k);
        return list.length
          ? `## ${KIND_TR[k]}\n${list.map((p) => `- [[${p.slug}|${p.title}]] — ${p.summary} _(${p.updated_at.slice(0, 10)})_`).join('\n')}`
          : '';
      })
      .filter(Boolean);
    writeFileSync(
      join(WIKI_DIR, 'index.md'),
      `# Güneş Wiki — İçindekiler\n\n_Bu klasör Güneş tarafından otomatik yazılır; düzenlemeler bir sonraki güncellemede üzerine yazılır._\n\n${groups.join('\n\n')}\n`,
    );

    const journal = await store.listJournal(200);
    writeFileSync(
      join(WIKI_DIR, 'log.md'),
      `# Güneş Günlüğü\n\n${journal.map((j) => `## [${j.created_at.slice(0, 10)}] ${j.created_at.slice(11, 16)}\n${j.content}`).join('\n\n')}\n`,
    );
  } catch (e) {
    console.error('[güneş] wiki dışa aktarılamadı:', (e as Error).message);
  }
}

function pageMarkdown(p: WikiPage, all: WikiPage[]) {
  const backlinks = all.filter((x) => x.links.includes(p.slug));
  const fm = ['---', `title: "${p.title.replace(/"/g, "'")}"`, `kind: ${p.kind}`, `updated: ${p.updated_at}`, `sources: ${p.sources.length}`, '---'];
  const back = backlinks.length ? `\n\n---\n**Bu sayfaya bağlananlar:** ${backlinks.map((b) => `[[${b.slug}|${b.title}]]`).join(', ')}` : '';
  return `${fm.join('\n')}\n\n# ${p.title}\n\n> ${p.summary}\n\n${p.content}${back}\n`;
}
