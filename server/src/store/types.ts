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
  /** İşi isteyen / kimden geldiği */
  requested_by: string | null;
  wiki_slug: string | null;
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
  /** Takvim etkinliklerinde bitiş saati (yoksa süre bilinmiyor) */
  ends_at?: string | null;
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
  /** Kullanıcının kendi gönderdiği mesaj mı (ilerleme sinyali) */
  from_me: boolean;
  /** Mail konuşma dizisi / Teams sohbet kimliği */
  thread_id: string | null;
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

export interface PendingAction {
  id: string;
  action: 'delete_card' | 'delete_memory' | 'confirm_link';
  target_id: string;
  title: string;
  reason: string;
  /** confirm_link için: { event_ids, question } */
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
}

export interface Briefing {
  id: string;
  kind: 'morning' | 'tracker' | 'weekly' | 'reflection';
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
export type NewEvent = Omit<EventItem, 'id' | 'created_at' | 'processed' | 'card_id' | 'from_me' | 'thread_id'> &
  Partial<Pick<EventItem, 'processed' | 'card_id' | 'from_me' | 'thread_id'>>;

/** Ses profili: BİYOMETRİK veri (KVKK özel nitelikli). Kişi başı silinebilir olmalı. */
export interface VoiceProfile {
  id: string;
  name: string;
  embedding: number[];
  model: string;
  samples: number;
  source: 'teams' | 'manual' | 'live';
  created_at: string;
  updated_at: string;
}

export const MEETING_STATUSES = ['recording', 'queued', 'processing', 'review', 'done', 'error'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
/** Transkript satırı: speaker = tanınan kişi adı, null = tanınmadı (cluster ile bir ses grubuna bağlanır) */
export interface MeetingCue {
  b: number;
  e: number;
  text: string;
  speaker: string | null;
  score: number | null;
  /** Tanınmayan sesler için grup kimliği (MeetingSpeaker.id) */
  cluster: string | null;
  /** Bağlam iyileştirme (Haiku) metni değiştirdiyse özgün konuşma tanıma metni */
  raw?: string;
}
/** Toplantıdaki bir ses: tanınmış kişi ya da isimlendirilmeyi bekleyen tanınmayan ses grubu */
export interface MeetingSpeaker {
  id: string;
  name: string | null;
  kind: 'known' | 'unknown';
  cues: number;
  seconds: number;
  /** Dinlemek için en uzun birkaç satırın zamanları (sn) */
  samples: { b: number; e: number }[];
  /** Grup merkezi: isim verilince profile dönüşür (yalnızca unknown) */
  embedding?: number[];
}
/** Toplantının yapılandırılmış özeti (Sonnet çıktısı) */
export interface MeetingAnalysis {
  ozet: string;
  konular: string[];
  kararlar: string[];
  aksiyonlar: { kim: string; ne: string; ne_zaman: string }[];
}
export type ProposalKind = 'create_card' | 'update_card' | 'wiki_meeting_page' | 'wiki_append' | 'remember' | 'followup_mail';
/** Güneş'in önerdiği iş: kullanıcı onaylamadan hiçbir şey yazılmaz */
export interface MeetingProposal {
  id: string;
  kind: ProposalKind;
  /** Kullanıcıya gösterilen tek satır */
  title: string;
  /** Neden önerildi (transkriptten dayanak) */
  reason: string;
  status: 'pending' | 'applied' | 'skipped' | 'failed';
  /** kind'a göre alanlar (bkz. server/src/meetings/proposals.ts) */
  payload: Record<string, unknown>;
  /** Uygulandıysa ne yapıldı (ör. "Kart açıldı: [ab12cd34]") */
  result?: string;
  /** followup_mail: hazırlanan TASLAK metin. Güneş mail göndermez ve Outlook'a taslak bile yazmaz; kullanıcı kopyalar. */
  draft?: string;
}
export interface Meeting {
  id: string;
  title: string;
  source: 'upload' | 'folder' | 'live';
  status: MeetingStatus;
  step: string;
  started_at: string | null;
  duration_sec: number | null;
  event_external_id: string | null;
  attendees: string[];
  project_slug: string | null;
  wiki_slug: string | null;
  audio_file: string | null;
  transcript: MeetingCue[];
  speakers: MeetingSpeaker[];
  summary: string | null;
  /** Yapılandırılmış özet (özet/konular/kararlar/aksiyonlar); migration 0007 yoksa boş */
  analysis?: MeetingAnalysis | null;
  /** Güneş'in önerileri (kart/wiki/hafıza); migration 0007 yoksa boş */
  proposals?: MeetingProposal[];
  error: string | null;
  created_at: string;
  updated_at: string;
}
export type NewMeeting = Partial<Omit<Meeting, 'id' | 'created_at' | 'updated_at'>> & { title: string };

export const WIKI_KINDS = ['project', 'person', 'topic', 'thread', 'overview'] as const;
export type WikiKind = (typeof WIKI_KINDS)[number];
export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  kind: WikiKind;
  summary: string;
  content: string;
  links: string[];
  sources: SourceRef[];
  created_at: string;
  updated_at: string;
}
export interface ThreadLink {
  thread_id: string;
  source: string;
  page_slug: string | null;
  card_id: string | null;
  note: string | null;
  created_at: string;
}

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
  /** Kısa id (ilk 8+ karakter) ile hedefli arama — tüm tabloyu çekmeden */
  findCardsByPrefix(prefix: string): Promise<Card[]>;
  createCard(card: NewCard): Promise<Card>;
  updateCard(id: string, patch: Partial<Card>): Promise<Card>;
  deleteCard(id: string): Promise<void>;
  addActivity(a: Omit<CardActivity, 'id' | 'created_at'>): Promise<void>;
  listActivity(cardId: string): Promise<CardActivity[]>;

  /** Yeni olayları ekler; aynı (source, external_id) varsa atlar. Eklenen sayısını döner. */
  insertEvents(events: NewEvent[]): Promise<{ inserted: number; skipped: number }>;
  listEvents(opts: { unprocessed?: boolean; limit?: number; sinceDays?: number }): Promise<EventItem[]>;
  updateEvents(ids: string[], patch: Partial<EventItem>): Promise<void>;
  findEventIdsByPrefix(prefixes: string[]): Promise<string[]>;

  listSuggestions(status?: Suggestion['status']): Promise<Suggestion[]>;
  createSuggestion(s: Omit<Suggestion, 'id' | 'created_at' | 'status'>): Promise<Suggestion>;
  updateSuggestion(id: string, patch: Partial<Suggestion>): Promise<void>;

  listPendingActions(status?: PendingAction['status']): Promise<PendingAction[]>;
  getPendingAction(id: string): Promise<PendingAction | null>;
  createPendingAction(a: Pick<PendingAction, 'action' | 'target_id' | 'title' | 'reason'> & { payload?: Record<string, unknown> }): Promise<PendingAction>;
  resolvePendingAction(id: string, status: 'approved' | 'rejected'): Promise<void>;

  latestBriefing(kind?: Briefing['kind']): Promise<Briefing | null>;
  listBriefings(limit: number): Promise<Briefing[]>;
  createBriefing(b: Omit<Briefing, 'id' | 'created_at'>): Promise<Briefing>;

  startRun(kind: string): Promise<AgentRun>;
  finishRun(id: string, patch: Partial<AgentRun>): Promise<void>;
  listRuns(limit: number): Promise<AgentRun[]>;
  /** Sunucu kapanınca yarıda kalan 'running' kayıtlarını kapatır */
  closeStaleRuns(message: string): Promise<number>;

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
  searchChatMessages(query: string, limit?: number): Promise<(ChatMessage & { session_title: string })[]>;

  listWikiPages(): Promise<WikiPage[]>;
  /** İçeriksiz liste (index, bağlantılar için hızlı) */
  listWikiMeta(): Promise<Omit<WikiPage, 'content' | 'sources'>[]>;
  getWikiPage(slug: string): Promise<WikiPage | null>;
  upsertWikiPage(p: Pick<WikiPage, 'slug' | 'title' | 'kind' | 'summary' | 'content' | 'links' | 'sources'>): Promise<WikiPage>;

  getThreadLinks(threadIds: string[]): Promise<ThreadLink[]>;
  upsertThreadLink(l: Omit<ThreadLink, 'created_at'>): Promise<void>;

  listVoiceProfiles(): Promise<VoiceProfile[]>;
  /** Aynı ad varsa günceller (isim büyük/küçük harf duyarlı) */
  upsertVoiceProfile(p: Pick<VoiceProfile, 'name' | 'embedding' | 'model' | 'samples' | 'source'>): Promise<VoiceProfile>;
  deleteVoiceProfile(id: string): Promise<void>;

  listMeetings(limit?: number): Promise<Meeting[]>;
  getMeeting(id: string): Promise<Meeting | null>;
  createMeeting(m: NewMeeting): Promise<Meeting>;
  updateMeeting(id: string, patch: Partial<Meeting>): Promise<Meeting>;
  deleteMeeting(id: string): Promise<void>;
}
