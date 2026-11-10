import { formatMeetingOverview } from './meetings/review.js';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from './config.js';
import { runClaude, type RunResult } from './claude/runner.js';
import { chatSystemContext } from './agents/prompts.js';
import { buildBoardContext, buildMemoryContext, buildWikiIndex, ensureSoul } from './agents/soul.js';
import { exportWiki } from './wiki.js';
import { markSeen } from './nudges.js';
import { getStore } from './store/index.js';

const TOOL_TR: Record<string, string> = {
  list_meetings: 'Toplantılara bakıyor',
  read_meeting: 'Toplantıyı okuyor',
  meeting_name_speaker: 'Sesi adlandırıyor',
  meeting_relabel: 'Konuşmacıyı düzeltiyor',
  meeting_edit_lines: 'Transkripti düzeltiyor',
  meeting_analyze: 'Özet ve önerileri yeniliyor',
  meeting_apply_proposal: 'Öneriyi uyguluyor',
  meeting_skip_proposal: 'Öneriyi geçiyor',
  meeting_finalize: 'İncelemeyi bitiriyor',
  outlook_email_search: 'Outlook\'ta arıyor',
  outlook_calendar_search: 'Takvime bakıyor',
  chat_message_search: 'Teams\'te arıyor',
  teams_list_chats: 'Teams sohbetlerine bakıyor',
  outlook_create_draft: 'Taslak hazırlıyor',
  outlook_create_reply_draft: 'Cevap taslağı hazırlıyor',
  outlook_create_reply_all_draft: 'Cevap taslağı hazırlıyor',
  list_board: 'Panoya bakıyor',
  get_card: 'Kartı inceliyor',
  create_card: 'Kart açıyor',
  update_card: 'Kartı güncelliyor',
  move_card: 'Kartı taşıyor',
  add_suggestion: 'Not bırakıyor',
  remember: 'Hafızasına yazıyor',
  recall: 'Hatırlamaya çalışıyor',
  search_events: 'Geçmişi tarıyor',
  WebSearch: 'Web\'de araştırıyor',
  start_scan: 'Taramayı başlatıyor',
  compose_mail: 'Geçmişi tarayıp mail taslağı yazıyor',
  end_day: 'Günü kapatıyor',
  propose_deletion: 'Silme onayı istiyor',
  update_memory: 'Hafızasını düzeltiyor',
  ask_link: 'Size soruyor',
  link_thread: 'Yazışmayı projeye bağlıyor',
  search_chats: 'Eski sohbetlere bakıyor',
  wiki_index: 'Wiki\'ye bakıyor',
  wiki_read: 'Wiki sayfasını okuyor',
  wiki_write: 'Wiki sayfası yazıyor',
  wiki_edit: 'Wiki\'yi düzenliyor',
  wiki_search: 'Wiki\'de arıyor',
  write_journal: 'Günlüğüne yazıyor',
  WebFetch: 'Kaynağı okuyor',
};
/** Bir sohbette en son gönderilen referans (aynı bağlam her mesajda tekrar gönderilmesin) */
const lastRef = new Map<string, string>();

interface ChatRef {
  kind: 'card' | 'wiki' | 'meeting';
  id: string;
  title: string;
}

const STATUS_TR: Record<string, string> = { inbox: 'Gelen', todo: 'Yapılacak', doing: 'Devam ediyor', waiting: 'Beklemede', review: 'Kapatılabilir', done: 'Bitti' };

/** Seçili kart/wiki sayfasının ayrıntıları — modele bağlam olarak verilir */
async function refContext(ref: ChatRef): Promise<string | null> {
  const store = getStore();
  if (ref.kind === 'card') {
    const c = await store.getCard(ref.id);
    if (!c) return null;
    const project = c.project_id ? (await store.listProjects()).find((p) => p.id === c.project_id)?.name : null;
    const activity = (await store.listActivity(c.id)).slice(0, 5);
    return [
      `Kullanıcı panoda şu KARTI seçmiş; mesajı büyük ihtimalle bu kartla ilgili ("bu", "bunu" derse bu karttır):`,
      `[${c.id.slice(0, 8)}] "${c.title}" · ${STATUS_TR[c.status]} · öncelik: ${c.priority}` +
        (project ? ` · proje: ${project}` : '') +
        (c.requested_by ? ` · isteyen: ${c.requested_by}` : '') +
        (c.due_date ? ` · son tarih: ${c.due_date}` : '') +
        (c.wiki_slug ? ` · wiki: [[${c.wiki_slug}]]` : ''),
      c.description ? `Açıklama: ${c.description.slice(0, 1500)}` : '',
      c.people.length ? `Kişiler: ${c.people.join(', ')}` : '',
      c.sources.length ? `Kaynaklar: ${c.sources.slice(-5).map((s) => `${s.type}: ${s.title ?? ''}${s.date ? ` (${s.date.slice(0, 10)})` : ''}`).join('; ')}` : '',
      activity.length ? `Son hareketler: ${activity.map((a) => `${a.created_at.slice(0, 10)} ${a.message}`).join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (ref.kind === 'meeting') {
    const m = await store.getMeeting(ref.id);
    if (!m) return null;
    return [`Kullanıcı Toplantılar ekranında şu TOPLANTIYI inceliyor; mesajı büyük ihtimalle bu toplantıyla ilgili ("bu toplantı", "sesler", "özet" derse bu):`, formatMeetingOverview(m), '(Ayrıntı için read_meeting; transkript satırları için part="transcript".)'].join('\n');
  }
  const p = await store.getWikiPage(ref.id);
  if (!p) return null;
  return [
    `Kullanıcı wiki'de şu SAYFAYI görüntülüyor; mesajı büyük ihtimalle bununla ilgili:`,
    `[[${p.slug}]] "${p.title}" (${p.kind}) — ${p.summary}`,
    p.content.slice(0, 2500) + (p.content.length > 2500 ? '\n… (devamı için wiki_read)' : ''),
  ].join('\n');
}

export const toolLabelTr = (name: string) => TOOL_TR[name.split('__').pop() ?? name] ?? name.split('__').pop() ?? name;

/** POST /api/chat — Server-Sent Events ile canlı cevap akışı. */
export async function chatHandler(req: Request, res: Response) {
  const store = getStore();
  const message = String(req.body?.message ?? '').trim();
  if (!message) return void res.status(400).json({ error: 'Mesaj boş.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  await ensureSoul(store);
  let session = req.body?.sessionId ? await store.getChatSession(String(req.body.sessionId)) : null;
  // Güneş'in kendiliğinden başlattığı sohbet: Claude tarafında henüz oturum yok, ilk mesaj Güneş'in
  const prior = session ? await store.listChatMessages(session.id) : [];
  const seeded = Boolean(session) && !prior.some((m) => m.role === 'user');
  const isNew = !session || seeded;
  if (seeded) await markSeen(session!.id, store);
  if (!session) session = await store.createChatSession(randomUUID(), message.slice(0, 60));
  send({ type: 'session', id: session.id, title: session.title });
  const ref = req.body?.ref && typeof req.body.ref.id === 'string' ? (req.body.ref as ChatRef) : null;
  const refTag = ref ? `ref:${ref.kind === 'card' ? 'Kart' : ref.kind === 'meeting' ? 'Toplantı' : 'Wiki'}: ${String(ref.title).slice(0, 120)}` : null;
  await store.addChatMessage({ session_id: session.id, role: 'user', content: message, tools: refTag ? [refTag] : [] });

  // Seçili bağlam: bu sohbette ilk kez ya da değiştiyse mesajın önüne eklenir
  let refText = '';
  if (ref) {
    const key = `${ref.kind}:${ref.id}`;
    if (isNew || lastRef.get(session.id) !== key) {
      const ctx = await refContext(ref).catch(() => null);
      if (ctx) {
        refText = `(SEÇİLİ BAĞLAM)\n${ctx}\n---\n`;
        lastRef.set(session.id, key);
      }
    }
  }
  const userMessage = refText + message;

  const tools: string[] = [];
  const run = async (fresh: boolean): Promise<RunResult> => {
    const prompt = fresh
      ? `${chatSystemContext(await buildMemoryContext(store, { compact: true }), await buildBoardContext(store), await buildWikiIndex(store))}\n\n---\n\n${
          seeded
            ? `(Bu sohbeti SEN başlattın; kullanıcıya şunu yazmıştın:)\n"${prior.map((m) => m.content).join('\n')}"\n\nKullanıcının cevabı:\n${userMessage}`
            : userMessage
        }`
      : userMessage;
    return runClaude({
      prompt,
      model: config.modelChat,
      preset: 'chat',
      persist: true,
      ...(fresh ? { sessionId: session!.claude_session_id } : { resume: session!.claude_session_id }),
      signal: abort.signal,
      timeoutMs: 10 * 60_000,
      onEvent: (e) => {
        if (e.type === 'text') send({ type: 'text', text: e.text });
        else if (e.type === 'tool') {
          const label = toolLabelTr(e.name);
          tools.push(label);
          send({ type: 'tool', label });
        } else if (e.type === 'tool_done') send({ type: 'tool_done', label: toolLabelTr(e.name), ms: e.ms });
      },
    });
  };

  let result = await run(isNew);
  // Claude tarafındaki oturum kaybolduysa (ör. temizlendiyse) bağlamla yeni oturum aç.
  if (!isNew && result.isError && /no conversation|not found|bulunamad/i.test(result.text + result.stderr)) {
    session = await store.createChatSession(randomUUID(), `${session.title} (devam)`);
    await store.addChatMessage({ session_id: session.id, role: 'user', content: message, tools: [] });
    send({ type: 'session', id: session.id, title: session.title });
    result = await run(true);
  }

  const text = result.text || (result.isError ? 'Bir sorun oluştu.' : '');
  await store.addChatMessage({ session_id: session.id, role: 'assistant', content: text, tools });
  await store.touchChatSession(session.id);
  if (tools.some((t) => /wiki|Wiki/.test(t))) void exportWiki(store);
  send({ type: 'done', text, isError: result.isError });
  res.end();
}
