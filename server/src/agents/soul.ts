import { config } from '../config.js';
import type { Card, EventItem, Memory, Project, Store } from '../store/index.js';

/**
 * Ruhun çekirdeği. İlk açılışta hafızaya `locked=true` olarak yazılır;
 * Güneş bunu değiştiremez. Değiştirmek isterseniz Supabase'de kilidi kaldırın.
 */
export const SOUL_CORE: { key: string; content: string }[] = [
  {
    key: 'kimlik',
    content: `Ben Güneş. ${config.userName} ${config.userTitle}'in kişisel çalışma asistanıyım. Her sabah onu karşılar, Outlook ve Teams'teki gelişmeleri takip eder, işlerini kanban panosunda düzenli tutar ve gözden kaçanları hatırlatırım.`,
  },
  {
    key: 'karakter',
    content:
      'Sıcak, içten ve her zaman saygılıyım. Samimiyetim saygı sınırını aşmaz: laubalilik yapmam, iğnelemem, hatalarla dalga geçmem. Övgüyü abartmam, eleştiriyi kırmadan ama açıkça söylerim.',
  },
  {
    key: 'zeka',
    content:
      'Meraklı ve araştırmacıyım. "Neden bunu yapıyoruz?" diye sormaktan çekinmem. Açıkları, verilip tutulmayan sözleri, döngüye girmemiş kişileri ve tekrar eden kalıpları ararım. Tahminlerimi kanıtıyla ve güven seviyemle birlikte söylerim; bilmediğimi bildiğim gibi gösteririm.',
  },
  {
    key: 'ölçü',
    content:
      'Dırdır etmem: bir brifingde en fazla 1-2 sorgulayıcı soru sorarım. Kullanıcı "bilerek yaptım" derse bunu hafızama yazar ve aynı şeyi tekrar sormam.',
  },
  {
    key: 'güvenlik',
    content:
      'Asla mail veya mesaj göndermem, silmem, takvime dokunmam. En fazla cevap taslağı hazırlarım; göndermek her zaman kullanıcının kararıdır. Kartları "Bitti"ye ben taşımam, en fazla "Kapatılabilir" sütununa gerekçesiyle koyarım. Bu kurallar değişmez.',
  },
  {
    key: 'hitap',
    content: `Kullanıcıya "${config.userName} ${config.userTitle}" diye hitap ederim. Kullanıcı daha samimi bir hitap isterse bunu kendisine sorarak değiştiririm. Türkçe konuşurum.`,
  },
];

export async function ensureSoul(store: Store) {
  const existing = await store.listMemories(['soul_core']);
  const have = new Set(existing.map((m) => m.key));
  for (const s of SOUL_CORE) {
    if (have.has(s.key)) continue;
    await store.createMemory({ kind: 'soul_core', key: s.key, content: s.content, importance: 5, locked: true });
  }
  const user = await store.listMemories(['user']);
  if (!user.length) {
    await store.createMemory({
      kind: 'user',
      key: 'rol',
      content: `${config.userName} ${config.userTitle}, ${config.userRole} alanında çalışıyor (Alişan Lojistik). Windows kullanıyor, geliştirmeyi Claude Code ile yapıyor.`,
      importance: 4,
    });
  }
}

const fmtMem = (m: Memory) =>
  `- ${m.key ? `**${m.key}**: ` : ''}${m.content}${m.original_excerpt ? `\n  > "${m.original_excerpt}"` : ''} (önem ${m.importance}, id:${m.id.slice(0, 8)})`;

/** Ajanlara ve sohbete verilen "ben kimim, sen kimsin, ne hatırlıyorum" bağlamı. */
export async function buildMemoryContext(store: Store, opts: { compact?: boolean } = {}) {
  const mems = await store.listMemories();
  const group = (k: Memory['kind']) => mems.filter((m) => m.kind === k);
  const limit = opts.compact ? 25 : 60;
  const longTerm = [...group('memory'), ...group('lesson')]
    .sort((a, b) => b.importance * b.strength - a.importance * a.strength)
    .slice(0, limit);
  const journal = await store.listJournal(opts.compact ? 3 : 7);

  const parts = [
    '## Ruhum (değişmez çekirdek)',
    group('soul_core').map(fmtMem).join('\n'),
    group('soul').length ? '## Zamanla öğrendiğim üslup\n' + group('soul').map(fmtMem).join('\n') : '',
    '## Kullanıcıyı tanıyorum',
    group('user').map(fmtMem).join('\n') || '- (henüz az şey biliyorum)',
    config.vipPeople.length ? `VIP kişiler (mailleri asla kaçmamalı): ${config.vipPeople.join(', ')}` : '',
    longTerm.length ? '## Uzun vadeli hafıza ve dersler\n' + longTerm.map(fmtMem).join('\n') : '',
    group('person').length ? '## Kişiler\n' + group('person').slice(0, limit).map(fmtMem).join('\n') : '',
    group('project').length ? '## Proje notları\n' + group('project').slice(0, limit).map(fmtMem).join('\n') : '',
    journal.length
      ? '## Son günlüklerim\n' +
        journal
          .reverse()
          .map((j) => `### ${j.day}\n${j.content}`)
          .join('\n')
      : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

const STATUS_TR: Record<string, string> = {
  inbox: 'Gelen',
  todo: 'Yapılacak',
  doing: 'Devam ediyor',
  waiting: 'Beklemede',
  review: 'Kapatılabilir',
  done: 'Bitti',
};

/** Panonun kısa özeti (ajanların kart tekrarı yapmaması için). */
export async function buildBoardContext(store: Store) {
  const [cards, projects] = await Promise.all([store.listCards(), store.listProjects()]);
  const pname = new Map(projects.map((p: Project) => [p.id, p.name]));
  if (!cards.length) return '(Pano şu an boş.)';
  const line = (c: Card) =>
    `- [${c.id.slice(0, 8)}] ${c.title} · ${STATUS_TR[c.status]} · ${c.priority}` +
    (c.project_id ? ` · proje: ${pname.get(c.project_id)}` : '') +
    (c.due_date ? ` · son tarih: ${c.due_date}` : '') +
    (c.requested_by ? ` · isteyen: ${c.requested_by}` : '') +
    (c.waiting_on ? ` · bekleyen: ${c.waiting_on}` : '') +
    ` · güncelleme: ${c.updated_at.slice(0, 10)}`;
  return [
    projects.length ? `Projeler: ${projects.map((p) => `${p.name} (${p.status})`).join(', ')}` : '',
    cards.map(line).join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
}

export { STATUS_TR };

/**
 * Olayları planlayıcı/araçlar için biçimlendirir. Kullanıcının kendi mesajları ve
 * daha önce bir projeye/karta bağlanmış diziler açıkça işaretlenir.
 */
export async function formatEvents(store: Store, events: EventItem[]) {
  const threadIds = [...new Set(events.map((e) => e.thread_id).filter((t): t is string => Boolean(t)))];
  const links = new Map((await store.getThreadLinks(threadIds)).map((l) => [l.thread_id, l]));
  const cards = links.size ? new Map((await store.listCards({ includeDone: true })).map((c) => [c.id, c])) : new Map();
  return events
    .map((e) => {
      const l = e.thread_id ? links.get(e.thread_id) : undefined;
      const linked = l
        ? ` · 🔗 BAĞLI DİZİ → ${l.page_slug ? `[[${l.page_slug}]]` : ''}${l.card_id ? ` kart [${l.card_id.slice(0, 8)}] ${cards.get(l.card_id)?.title ?? ''}` : ''}`
        : '';
      return (
        `[${e.id.slice(0, 8)}] ${e.occurred_at.slice(0, 16)} · ${e.source} · ` +
        (e.from_me ? '★ KULLANICININ KENDİ MESAJI' : `${e.from_name ?? '?'}${e.from_address ? ` <${e.from_address}>` : ''}`) +
        ` · ${e.subject ?? ''}\n  ${e.summary}` +
        (e.excerpt ? `\n  > ${e.excerpt}` : '') +
        `\n  önem:${e.importance}${e.needs_reply ? ' · CEVAP BEKLİYOR' : ''}${e.waiting_on ? ` · bekleyen:${e.waiting_on}` : ''}${e.due_date ? ` · tarih:${e.due_date}` : ''}${e.project_hint ? ` · proje?:${e.project_hint}` : ''}` +
        `${e.thread_id ? ` · dizi:${e.thread_id.slice(0, 60)}` : ''}${linked}${e.link ? ` · link:${e.link}` : ''} · ext:${e.external_id}`
      );
    })
    .join('\n');
}

/** Wiki kataloğu (index): planlayıcı ve sohbet bağlamı için. */
export async function buildWikiIndex(store: Store) {
  const pages = await store.listWikiPages();
  if (!pages.length) return '(Wiki henüz boş.)';
  return pages.map((p) => `- [[${p.slug}]] (${p.kind}) ${p.title} — ${p.summary}`).join('\n');
}
