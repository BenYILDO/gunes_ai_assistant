import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentRun,
  Briefing,
  Card,
  CardActivity,
  ChatMessage,
  ChatSession,
  EventItem,
  JournalEntry,
  Memory,
  PendingAction,
  ThreadLink,
  WikiPage,
  MemoryKind,
  NewCard,
  NewEvent,
  Project,
  Store,
  Suggestion,
} from './types.js';

/** UUID önekini (ör. "abcd1234") id aralığına çevirir: uuid sıralaması hex sıralamasıyla aynıdır. */
function uuidRange(prefix: string): [string, string] | null {
  const hex = prefix.trim().toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{4,32}$/.test(hex)) return null;
  const fmt = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  return [fmt(hex.padEnd(32, '0')), fmt(hex.padEnd(32, 'f'))];
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase (${what}): ${res.error.message}`);
  return res.data as T;
}

export class SupabaseStore implements Store {
  readonly mode = 'supabase' as const;
  private db: SupabaseClient;

  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async listProjects() {
    return must(await this.db.from('projects').select('*').order('name'), 'projects') as Project[];
  }
  async upsertProject(name: string, patch: Partial<Project> = {}) {
    const existing = must(await this.db.from('projects').select('*').ilike('name', name).maybeSingle(), 'project');
    if (existing) {
      if (!Object.keys(patch).length) return existing as Project;
      return must(
        await this.db.from('projects').update(patch).eq('id', (existing as Project).id).select().single(),
        'project update',
      ) as Project;
    }
    return must(await this.db.from('projects').insert({ name, ...patch }).select().single(), 'project insert') as Project;
  }

  async listCards(opts: { includeDone?: boolean } = {}) {
    let q = this.db.from('cards').select('*').order('position').order('created_at', { ascending: false });
    if (!opts.includeDone) {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      q = q.or(`status.neq.done,closed_at.gte."${weekAgo}"`);
    }
    return must(await q, 'cards') as Card[];
  }
  async getCard(id: string) {
    return must(await this.db.from('cards').select('*').eq('id', id).maybeSingle(), 'card') as Card | null;
  }
  async findCardsByPrefix(prefix: string) {
    const r = uuidRange(prefix);
    if (!r) return [];
    return must(await this.db.from('cards').select('*').gte('id', r[0]).lte('id', r[1]).limit(5), 'card prefix') as Card[];
  }
  async createCard(card: NewCard) {
    return must(await this.db.from('cards').insert(card).select().single(), 'card insert') as Card;
  }
  async updateCard(id: string, patch: Partial<Card>) {
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = patch;
    return must(await this.db.from('cards').update(rest).eq('id', id).select().single(), 'card update') as Card;
  }
  async deleteCard(id: string) {
    must(await this.db.from('cards').delete().eq('id', id), 'card delete');
  }
  async addActivity(a: Omit<CardActivity, 'id' | 'created_at'>) {
    must(await this.db.from('card_activity').insert(a), 'activity');
  }
  async listActivity(cardId: string) {
    return must(
      await this.db.from('card_activity').select('*').eq('card_id', cardId).order('created_at', { ascending: false }).limit(50),
      'activity list',
    ) as CardActivity[];
  }

  async insertEvents(events: NewEvent[]) {
    if (!events.length) return { inserted: 0, skipped: 0 };
    const res = must(
      await this.db
        .from('events')
        .upsert(events, { onConflict: 'source,external_id', ignoreDuplicates: true })
        .select('id'),
      'events insert',
    ) as { id: string }[];
    return { inserted: res.length, skipped: events.length - res.length };
  }
  async listEvents(opts: { unprocessed?: boolean; limit?: number; sinceDays?: number }) {
    let q = this.db.from('events').select('*').order('occurred_at', { ascending: true });
    if (opts.unprocessed) q = q.eq('processed', false);
    if (opts.sinceDays) q = q.gte('occurred_at', new Date(Date.now() - opts.sinceDays * 864e5).toISOString());
    q = q.limit(opts.limit ?? 200);
    return must(await q, 'events') as EventItem[];
  }
  async updateEvents(ids: string[], patch: Partial<EventItem>) {
    if (!ids.length) return;
    must(await this.db.from('events').update(patch).in('id', ids), 'events update');
  }

  async findEventIdsByPrefix(prefixes: string[]) {
    const out: string[] = [];
    for (const p of prefixes) {
      const r = uuidRange(p);
      if (!r) continue;
      const rows = must(await this.db.from('events').select('id').gte('id', r[0]).lte('id', r[1]).limit(2), 'event prefix') as { id: string }[];
      if (rows.length === 1) out.push(rows[0].id);
    }
    return out;
  }

  async listSuggestions(status?: Suggestion['status']) {
    let q = this.db.from('suggestions').select('*').order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    return must(await q, 'suggestions') as Suggestion[];
  }
  async createSuggestion(s: Omit<Suggestion, 'id' | 'created_at' | 'status'>) {
    return must(await this.db.from('suggestions').insert(s).select().single(), 'suggestion') as Suggestion;
  }
  async updateSuggestion(id: string, patch: Partial<Suggestion>) {
    must(await this.db.from('suggestions').update(patch).eq('id', id), 'suggestion update');
  }

  async listPendingActions(status?: PendingAction['status']) {
    let q = this.db.from('pending_actions').select('*').order('created_at', { ascending: false }).limit(50);
    if (status) q = q.eq('status', status);
    return must(await q, 'pending actions') as PendingAction[];
  }
  async getPendingAction(id: string) {
    return must(await this.db.from('pending_actions').select('*').eq('id', id).maybeSingle(), 'pending action') as PendingAction | null;
  }
  async createPendingAction(a: Pick<PendingAction, 'action' | 'target_id' | 'title' | 'reason'> & { payload?: Record<string, unknown> }) {
    return must(await this.db.from('pending_actions').insert(a).select().single(), 'pending action insert') as PendingAction;
  }
  async resolvePendingAction(id: string, status: 'approved' | 'rejected') {
    must(
      await this.db.from('pending_actions').update({ status, resolved_at: new Date().toISOString() }).eq('id', id),
      'pending action resolve',
    );
  }

  async latestBriefing(kind?: Briefing['kind']) {
    let q = this.db.from('briefings').select('*').order('created_at', { ascending: false }).limit(1);
    if (kind) q = q.eq('kind', kind);
    const rows = must(await q, 'briefing') as Briefing[];
    return rows[0] ?? null;
  }
  async listBriefings(limit: number) {
    return must(
      await this.db.from('briefings').select('*').order('created_at', { ascending: false }).limit(limit),
      'briefings',
    ) as Briefing[];
  }
  async createBriefing(b: Omit<Briefing, 'id' | 'created_at'>) {
    return must(await this.db.from('briefings').insert(b).select().single(), 'briefing insert') as Briefing;
  }

  async startRun(kind: string) {
    return must(await this.db.from('agent_runs').insert({ kind }).select().single(), 'run') as AgentRun;
  }
  async finishRun(id: string, patch: Partial<AgentRun>) {
    must(
      await this.db
        .from('agent_runs')
        .update({ finished_at: new Date().toISOString(), ...patch })
        .eq('id', id),
      'run finish',
    );
  }
  async listRuns(limit: number) {
    return must(
      await this.db.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(limit),
      'runs',
    ) as AgentRun[];
  }

  async getState(key: string) {
    const row = must(await this.db.from('sync_state').select('value').eq('key', key).maybeSingle(), 'state') as {
      value: string;
    } | null;
    return row?.value ?? null;
  }
  async setState(key: string, value: string) {
    must(await this.db.from('sync_state').upsert({ key, value, updated_at: new Date().toISOString() }), 'state set');
  }

  async listMemories(kinds?: MemoryKind[]) {
    let q = this.db.from('memories').select('*').order('importance', { ascending: false }).order('updated_at', {
      ascending: false,
    });
    if (kinds?.length) q = q.in('kind', kinds);
    return must(await q, 'memories') as Memory[];
  }
  async createMemory(m: Partial<Memory> & { kind: MemoryKind; content: string }) {
    return must(await this.db.from('memories').insert(m).select().single(), 'memory insert') as Memory;
  }
  async updateMemory(id: string, patch: Partial<Memory>) {
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = patch;
    return must(await this.db.from('memories').update(rest).eq('id', id).select().single(), 'memory update') as Memory;
  }
  async deleteMemory(id: string) {
    must(await this.db.from('memories').delete().eq('id', id), 'memory delete');
  }

  async listJournal(limit: number) {
    return must(
      await this.db.from('journal').select('*').order('created_at', { ascending: false }).limit(limit),
      'journal',
    ) as JournalEntry[];
  }
  async addJournal(content: string, day?: string) {
    must(await this.db.from('journal').insert(day ? { content, day } : { content }), 'journal insert');
  }

  async listChatSessions() {
    return must(
      await this.db.from('chat_sessions').select('*').order('updated_at', { ascending: false }).limit(50),
      'chat sessions',
    ) as ChatSession[];
  }
  async getChatSession(id: string) {
    return must(await this.db.from('chat_sessions').select('*').eq('id', id).maybeSingle(), 'chat session') as ChatSession | null;
  }
  async createChatSession(claudeSessionId: string, title: string) {
    return must(
      await this.db.from('chat_sessions').insert({ claude_session_id: claudeSessionId, title }).select().single(),
      'chat session insert',
    ) as ChatSession;
  }
  async touchChatSession(id: string, title?: string) {
    must(
      await this.db
        .from('chat_sessions')
        .update(title ? { title } : { updated_at: new Date().toISOString() })
        .eq('id', id),
      'chat session touch',
    );
  }
  async deleteChatSession(id: string) {
    must(await this.db.from('chat_sessions').delete().eq('id', id), 'chat session delete');
  }
  async listChatMessages(sessionId: string) {
    return must(
      await this.db.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at'),
      'chat messages',
    ) as ChatMessage[];
  }
  async addChatMessage(m: Omit<ChatMessage, 'id' | 'created_at'>) {
    return must(await this.db.from('chat_messages').insert(m).select().single(), 'chat message insert') as ChatMessage;
  }

  async searchChatMessages(query: string, limit = 30) {
    const rows = must(
      await this.db
        .from('chat_messages')
        .select('*, chat_sessions(title)')
        .ilike('content', `%${query.replace(/[%_]/g, '')}%`)
        .order('created_at', { ascending: false })
        .limit(limit),
      'chat search',
    ) as (ChatMessage & { chat_sessions: { title: string } | null })[];
    return rows.map(({ chat_sessions, ...m }) => ({ ...m, session_title: chat_sessions?.title ?? '' }));
  }

  async listWikiPages() {
    return must(await this.db.from('wiki_pages').select('*').order('kind').order('title'), 'wiki list') as WikiPage[];
  }
  async listWikiMeta() {
    return must(
      await this.db.from('wiki_pages').select('id, slug, title, kind, summary, links, created_at, updated_at').order('kind').order('title'),
      'wiki meta',
    ) as Omit<WikiPage, 'content' | 'sources'>[];
  }
  async getWikiPage(slug: string) {
    return must(await this.db.from('wiki_pages').select('*').eq('slug', slug).maybeSingle(), 'wiki page') as WikiPage | null;
  }
  async upsertWikiPage(p: Pick<WikiPage, 'slug' | 'title' | 'kind' | 'summary' | 'content' | 'links' | 'sources'>) {
    return must(await this.db.from('wiki_pages').upsert(p, { onConflict: 'slug' }).select().single(), 'wiki upsert') as WikiPage;
  }

  async getThreadLinks(threadIds: string[]) {
    if (!threadIds.length) return [];
    return must(await this.db.from('thread_links').select('*').in('thread_id', threadIds), 'thread links') as ThreadLink[];
  }
  async upsertThreadLink(l: Omit<ThreadLink, 'created_at'>) {
    must(await this.db.from('thread_links').upsert(l, { onConflict: 'thread_id' }), 'thread link upsert');
  }
}
