import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

interface Db {
  projects: Project[];
  cards: Card[];
  card_activity: CardActivity[];
  events: EventItem[];
  suggestions: Suggestion[];
  pending_actions: PendingAction[];
  briefings: Briefing[];
  agent_runs: AgentRun[];
  sync_state: Record<string, string>;
  memories: Memory[];
  journal: JournalEntry[];
  chat_sessions: ChatSession[];
  chat_messages: ChatMessage[];
  wiki_pages: WikiPage[];
  thread_links: ThreadLink[];
}

const empty = (): Db => ({
  projects: [],
  cards: [],
  card_activity: [],
  events: [],
  suggestions: [],
  pending_actions: [],
  briefings: [],
  agent_runs: [],
  sync_state: {},
  memories: [],
  journal: [],
  chat_sessions: [],
  chat_messages: [],
  wiki_pages: [],
  thread_links: [],
});

const now = () => new Date().toISOString();
const byDesc = <T>(k: keyof T) => (a: T, b: T) => String(b[k]).localeCompare(String(a[k]));

/**
 * Supabase ayarlanmadığında kullanılan JSON dosyası tabanlı depo.
 * Sunucu ve MCP süreci aynı dosyayı paylaştığı için her işlemde dosya yeniden okunur.
 * Kişisel deneme içindir; kalıcı kullanım için Supabase önerilir.
 */
export class LocalStore implements Store {
  readonly mode = 'local' as const;
  constructor(private file: string) {}

  private read(): Db {
    if (!existsSync(this.file)) return empty();
    try {
      return { ...empty(), ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch {
      return empty();
    }
  }
  private write(db: Db) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 1));
    renameSync(tmp, this.file);
  }
  private tx<T>(fn: (db: Db) => T): T {
    const db = this.read();
    const r = fn(db);
    this.write(db);
    return r;
  }

  async listProjects() {
    return this.read().projects.sort((a, b) => a.name.localeCompare(b.name));
  }
  async upsertProject(name: string, patch: Partial<Project> = {}) {
    return this.tx((db) => {
      let p = db.projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (p) Object.assign(p, patch, { updated_at: now() });
      else {
        p = {
          id: randomUUID(),
          name,
          description: null,
          status: 'active',
          summary: null,
          created_at: now(),
          updated_at: now(),
          ...patch,
        };
        db.projects.push(p);
      }
      return p;
    });
  }

  async listCards(opts: { includeDone?: boolean } = {}) {
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    return this.read()
      .cards.filter((c) => opts.includeDone || c.status !== 'done' || (c.closed_at ?? '') >= weekAgo)
      .sort((a, b) => a.position - b.position || b.created_at.localeCompare(a.created_at));
  }
  async getCard(id: string) {
    return this.read().cards.find((c) => c.id === id) ?? null;
  }
  async createCard(card: NewCard) {
    return this.tx((db) => {
      const c: Card = {
        id: randomUUID(),
        description: null,
        status: 'inbox',
        priority: 'medium',
        project_id: null,
        due_date: null,
        waiting_on: null,
        people: [],
        tags: [],
        sources: [],
        created_by: 'gunes',
        close_reason: null,
        requested_by: null,
        wiki_slug: null,
        position: 0,
        closed_at: null,
        created_at: now(),
        updated_at: now(),
        ...card,
      };
      db.cards.push(c);
      return c;
    });
  }
  async updateCard(id: string, patch: Partial<Card>) {
    return this.tx((db) => {
      const c = db.cards.find((x) => x.id === id);
      if (!c) throw new Error(`Kart bulunamadı: ${id}`);
      Object.assign(c, { updated_at: now() }, patch, { id });
      return c;
    });
  }
  async deleteCard(id: string) {
    this.tx((db) => {
      db.cards = db.cards.filter((c) => c.id !== id);
      db.card_activity = db.card_activity.filter((a) => a.card_id !== id);
    });
  }
  async addActivity(a: Omit<CardActivity, 'id' | 'created_at'>) {
    this.tx((db) => db.card_activity.push({ id: randomUUID(), created_at: now(), ...a }));
  }
  async listActivity(cardId: string) {
    return this.read()
      .card_activity.filter((a) => a.card_id === cardId)
      .sort(byDesc('created_at'))
      .slice(0, 50);
  }

  async insertEvents(events: NewEvent[]) {
    return this.tx((db) => {
      let inserted = 0;
      for (const e of events) {
        if (db.events.some((x) => x.source === e.source && x.external_id === e.external_id)) continue;
        db.events.push({ id: randomUUID(), created_at: now(), processed: false, card_id: null, from_me: false, thread_id: null, ...e });
        inserted++;
      }
      return { inserted, skipped: events.length - inserted };
    });
  }
  async listEvents(opts: { unprocessed?: boolean; limit?: number; sinceDays?: number }) {
    const since = opts.sinceDays ? new Date(Date.now() - opts.sinceDays * 864e5).toISOString() : '';
    return this.read()
      .events.filter((e) => (!opts.unprocessed || !e.processed) && e.occurred_at >= since)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .slice(0, opts.limit ?? 200);
  }
  async updateEvents(ids: string[], patch: Partial<EventItem>) {
    this.tx((db) => db.events.filter((e) => ids.includes(e.id)).forEach((e) => Object.assign(e, patch)));
  }

  async listSuggestions(status?: Suggestion['status']) {
    return this.read()
      .suggestions.filter((s) => !status || s.status === status)
      .sort(byDesc('created_at'))
      .slice(0, 100);
  }
  async createSuggestion(s: Omit<Suggestion, 'id' | 'created_at' | 'status'>) {
    return this.tx((db) => {
      const x: Suggestion = { id: randomUUID(), created_at: now(), status: 'open', ...s };
      db.suggestions.push(x);
      return x;
    });
  }
  async updateSuggestion(id: string, patch: Partial<Suggestion>) {
    this.tx((db) => Object.assign(db.suggestions.find((s) => s.id === id) ?? {}, patch));
  }

  async listPendingActions(status?: PendingAction['status']) {
    return this.read()
      .pending_actions.filter((a) => !status || a.status === status)
      .sort(byDesc('created_at'))
      .slice(0, 50);
  }
  async getPendingAction(id: string) {
    return this.read().pending_actions.find((a) => a.id === id) ?? null;
  }
  async createPendingAction(a: Pick<PendingAction, 'action' | 'target_id' | 'title' | 'reason'> & { payload?: Record<string, unknown> }) {
    return this.tx((db) => {
      const x: PendingAction = { id: randomUUID(), status: 'pending', created_at: now(), resolved_at: null, payload: {}, ...a };
      db.pending_actions.push(x);
      return x;
    });
  }
  async resolvePendingAction(id: string, status: 'approved' | 'rejected') {
    this.tx((db) => Object.assign(db.pending_actions.find((a) => a.id === id) ?? {}, { status, resolved_at: now() }));
  }

  async latestBriefing(kind?: Briefing['kind']) {
    return this.read().briefings.filter((b) => !kind || b.kind === kind).sort(byDesc('created_at'))[0] ?? null;
  }
  async listBriefings(limit: number) {
    return this.read().briefings.sort(byDesc('created_at')).slice(0, limit);
  }
  async createBriefing(b: Omit<Briefing, 'id' | 'created_at'>) {
    return this.tx((db) => {
      const x: Briefing = { id: randomUUID(), created_at: now(), ...b };
      db.briefings.push(x);
      return x;
    });
  }

  async startRun(kind: string) {
    return this.tx((db) => {
      const r: AgentRun = {
        id: randomUUID(),
        kind,
        status: 'running',
        started_at: now(),
        finished_at: null,
        stats: {},
        error: null,
      };
      db.agent_runs.push(r);
      db.agent_runs = db.agent_runs.slice(-300);
      return r;
    });
  }
  async finishRun(id: string, patch: Partial<AgentRun>) {
    this.tx((db) => Object.assign(db.agent_runs.find((r) => r.id === id) ?? {}, { finished_at: now() }, patch));
  }
  async listRuns(limit: number) {
    return this.read().agent_runs.sort(byDesc('started_at')).slice(0, limit);
  }

  async getState(key: string) {
    return this.read().sync_state[key] ?? null;
  }
  async setState(key: string, value: string) {
    this.tx((db) => (db.sync_state[key] = value));
  }

  async listMemories(kinds?: MemoryKind[]) {
    return this.read()
      .memories.filter((m) => !kinds?.length || kinds.includes(m.kind))
      .sort((a, b) => b.importance - a.importance || b.updated_at.localeCompare(a.updated_at));
  }
  async createMemory(m: Partial<Memory> & { kind: MemoryKind; content: string }) {
    return this.tx((db) => {
      const x: Memory = {
        id: randomUUID(),
        key: null,
        original_excerpt: null,
        importance: 3,
        strength: 1,
        last_recalled_at: null,
        source: null,
        locked: false,
        created_at: now(),
        updated_at: now(),
        ...m,
      };
      db.memories.push(x);
      return x;
    });
  }
  async updateMemory(id: string, patch: Partial<Memory>) {
    return this.tx((db) => {
      const m = db.memories.find((x) => x.id === id);
      if (!m) throw new Error(`Hafıza kaydı bulunamadı: ${id}`);
      if (m.locked && patch.content !== undefined && patch.content !== m.content)
        throw new Error('Bu hafıza kaydı kilitli (ruhun çekirdeği).');
      Object.assign(m, patch, { id, updated_at: now() });
      return m;
    });
  }
  async deleteMemory(id: string) {
    this.tx((db) => {
      const m = db.memories.find((x) => x.id === id);
      if (m?.locked) throw new Error('Bu hafıza kaydı kilitli (ruhun çekirdeği).');
      db.memories = db.memories.filter((x) => x.id !== id);
    });
  }

  async listJournal(limit: number) {
    return this.read().journal.sort(byDesc('created_at')).slice(0, limit);
  }
  async addJournal(content: string, day?: string) {
    this.tx((db) =>
      db.journal.push({ id: randomUUID(), day: day ?? now().slice(0, 10), content, created_at: now() }),
    );
  }

  async listChatSessions() {
    return this.read().chat_sessions.sort(byDesc('updated_at')).slice(0, 50);
  }
  async getChatSession(id: string) {
    return this.read().chat_sessions.find((s) => s.id === id) ?? null;
  }
  async createChatSession(claudeSessionId: string, title: string) {
    return this.tx((db) => {
      const s: ChatSession = {
        id: randomUUID(),
        claude_session_id: claudeSessionId,
        title,
        created_at: now(),
        updated_at: now(),
      };
      db.chat_sessions.push(s);
      return s;
    });
  }
  async touchChatSession(id: string, title?: string) {
    this.tx((db) => {
      const s = db.chat_sessions.find((x) => x.id === id);
      if (s) Object.assign(s, title ? { title } : {}, { updated_at: now() });
    });
  }
  async deleteChatSession(id: string) {
    this.tx((db) => {
      db.chat_sessions = db.chat_sessions.filter((s) => s.id !== id);
      db.chat_messages = db.chat_messages.filter((m) => m.session_id !== id);
    });
  }
  async listChatMessages(sessionId: string) {
    return this.read()
      .chat_messages.filter((m) => m.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async addChatMessage(m: Omit<ChatMessage, 'id' | 'created_at'>) {
    return this.tx((db) => {
      const x: ChatMessage = { id: randomUUID(), created_at: now(), ...m };
      db.chat_messages.push(x);
      return x;
    });
  }

  async searchChatMessages(query: string, limit = 30) {
    const db = this.read();
    const q = query.toLocaleLowerCase('tr');
    const title = new Map(db.chat_sessions.map((s) => [s.id, s.title]));
    return db.chat_messages
      .filter((m) => m.content.toLocaleLowerCase('tr').includes(q))
      .sort(byDesc('created_at'))
      .slice(0, limit)
      .map((m) => ({ ...m, session_title: title.get(m.session_id) ?? '' }));
  }

  async listWikiPages() {
    return this.read().wiki_pages.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, 'tr'));
  }
  async getWikiPage(slug: string) {
    return this.read().wiki_pages.find((p) => p.slug === slug) ?? null;
  }
  async upsertWikiPage(p: Pick<WikiPage, 'slug' | 'title' | 'kind' | 'summary' | 'content' | 'links' | 'sources'>) {
    return this.tx((db) => {
      let x = db.wiki_pages.find((w) => w.slug === p.slug);
      if (x) Object.assign(x, p, { updated_at: now() });
      else {
        x = { id: randomUUID(), created_at: now(), updated_at: now(), ...p };
        db.wiki_pages.push(x);
      }
      return x;
    });
  }

  async getThreadLinks(threadIds: string[]) {
    return this.read().thread_links.filter((l) => threadIds.includes(l.thread_id));
  }
  async upsertThreadLink(l: Omit<ThreadLink, 'created_at'>) {
    this.tx((db) => {
      const x = db.thread_links.find((t) => t.thread_id === l.thread_id);
      if (x) Object.assign(x, l);
      else db.thread_links.push({ ...l, created_at: now() });
    });
  }
}
