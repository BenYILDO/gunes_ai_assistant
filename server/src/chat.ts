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
  await store.addChatMessage({ session_id: session.id, role: 'user', content: message, tools: [] });

  const tools: string[] = [];
  const run = async (fresh: boolean): Promise<RunResult> => {
    const prompt = fresh
      ? `${chatSystemContext(await buildMemoryContext(store, { compact: true }), await buildBoardContext(store), await buildWikiIndex(store))}\n\n---\n\n${
          seeded
            ? `(Bu sohbeti SEN başlattın; kullanıcıya şunu yazmıştın:)\n"${prior.map((m) => m.content).join('\n')}"\n\nKullanıcının cevabı:\n${message}`
            : message
        }`
      : message;
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
