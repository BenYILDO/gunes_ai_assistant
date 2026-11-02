export const CARD_STATUSES = ['inbox', 'todo', 'doing', 'waiting', 'review', 'done'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface SourceRef {
  type: 'outlook' | 'teams' | 'calendar' | 'chat' | 'other';
  external_id?: string;
  link?: string;
  title?: string;
  date?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'done';
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  title: string;
  description: string | null;
  status: CardStatus;
  priority: Priority;
  project_id: string | null;
  due_date: string | null;
  waiting_on: string | null;
  people: string[];
  tags: string[];
  sources: SourceRef[];
  created_by: 'gunes' | 'user';
  close_reason: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface CardActivity {
  id: string;
  card_id: string;
  actor: 'gunes' | 'user';
  kind: 'created' | 'moved' | 'updated' | 'note';
  message: string;
  created_at: string;
}

export interface EventItem {
  id: string;
  source: 'outlook' | 'teams' | 'calendar' | 'other';
  external_id: string;
  occurred_at: string;
  from_name: string | null;
  from_address: string | null;
  subject: string | null;
  summary: string;
  excerpt: string | null;
  link: string | null;
  needs_reply: boolean;
  waiting_on: string | null;
  due_date: string | null;
  importance: number;
  project_hint: string | null;
  processed: boolean;
  card_id: string | null;
  created_at: string;
}

export type SuggestionKind = 'reminder' | 'risk' | 'question' | 'followup' | 'idea';
export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  body: string | null;
  card_id: string | null;
  status: 'open' | 'accepted' | 'dismissed';
  created_at: string;
}

export interface Briefing {
  id: string;
  kind: 'morning' | 'tracker';
  headline: string;
  content: string;
  stats: Record<string, unknown>;
  created_at: string;
}

export interface AgentRun {
  id: string;
  kind: string;
  status: 'running' | 'ok' | 'error' | 'skipped';
  started_at: string;
  finished_at: string | null;
  stats: Record<string, unknown>;
  error: string | null;
}

export const MEMORY_KINDS = ['soul_core', 'soul', 'user', 'memory', 'lesson', 'person', 'project'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export interface Memory {
  id: string;
  kind: MemoryKind;
  key: string | null;
  content: string;
  original_excerpt: string | null;
  importance: number;
  strength: number;
  last_recalled_at: string | null;
  source: Record<string, unknown> | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  day: string;
  content: string;
  created_at: string;
}

export interface ChatSession {
  id: string;
  claude_session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  tools: string[];
  created_at: string;
}

export type NewCard = Partial<Omit<Card, 'id' | 'created_at' | 'updated_at'>> & { title: string };
export type NewEvent = Omit<EventItem, 'id' | 'created_at' | 'processed' | 'card_id'> &
  Partial<Pick<EventItem, 'processed' | 'card_id'>>;

/**
 * Tüm veri erişimi bu arayüzden geçer. İki uygulaması var:
 *  - SupabaseStore (asıl kullanım)
 *  - LocalStore    (Supabase ayarlanmadıysa, data/local-db.json)
 */
export interface Store {
  readonly mode: 'supabase' | 'local';

  listProjects(): Promise<Project[]>;
  upsertProject(name: string, patch?: Partial<Project>): Promise<Project>;

  listCards(opts?: { includeDone?: boolean }): Promise<Card[]>;
  getCard(id: string): Promise<Card | null>;
  createCard(card: NewCard): Promise<Card>;
  updateCard(id: string, patch: Partial<Card>): Promise<Card>;
  deleteCard(id: string): Promise<void>;
  addActivity(a: Omit<CardActivity, 'id' | 'created_at'>): Promise<void>;
  listActivity(cardId: string): Promise<CardActivity[]>;

  /** Yeni olayları ekler; aynı (source, external_id) varsa atlar. Eklenen sayısını döner. */
  insertEvents(events: NewEvent[]): Promise<{ inserted: number; skipped: number }>;
  listEvents(opts: { unprocessed?: boolean; limit?: number; sinceDays?: number }): Promise<EventItem[]>;
  updateEvents(ids: string[], patch: Partial<EventItem>): Promise<void>;

  listSuggestions(status?: Suggestion['status']): Promise<Suggestion[]>;
  createSuggestion(s: Omit<Suggestion, 'id' | 'created_at' | 'status'>): Promise<Suggestion>;
  updateSuggestion(id: string, patch: Partial<Suggestion>): Promise<void>;

  latestBriefing(kind?: Briefing['kind']): Promise<Briefing | null>;
  listBriefings(limit: number): Promise<Briefing[]>;
  createBriefing(b: Omit<Briefing, 'id' | 'created_at'>): Promise<Briefing>;

  startRun(kind: string): Promise<AgentRun>;
  finishRun(id: string, patch: Partial<AgentRun>): Promise<void>;
  listRuns(limit: number): Promise<AgentRun[]>;

  getState(key: string): Promise<string | null>;
  setState(key: string, value: string): Promise<void>;

  listMemories(kinds?: MemoryKind[]): Promise<Memory[]>;
  createMemory(m: Partial<Memory> & { kind: MemoryKind; content: string }): Promise<Memory>;
  updateMemory(id: string, patch: Partial<Memory>): Promise<Memory>;
  deleteMemory(id: string): Promise<void>;

  listJournal(limit: number): Promise<JournalEntry[]>;
  addJournal(content: string, day?: string): Promise<void>;

  listChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | null>;
  createChatSession(claudeSessionId: string, title: string): Promise<ChatSession>;
  touchChatSession(id: string, title?: string): Promise<void>;
  deleteChatSession(id: string): Promise<void>;
  listChatMessages(sessionId: string): Promise<ChatMessage[]>;
  addChatMessage(m: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage>;
}
