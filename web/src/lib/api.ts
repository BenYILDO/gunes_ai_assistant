export type CardStatus = 'inbox' | 'todo' | 'doing' | 'waiting' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface SourceRef {
  type: 'outlook' | 'teams' | 'calendar' | 'chat' | 'other';
  external_id?: string;
  link?: string;
  title?: string;
  date?: string;
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
  requested_by: string | null;
  wiki_slug: string | null;
}
export interface Project { id: string; name: string; status: string; summary: string | null }
export interface Activity { id: string; actor: 'gunes' | 'user'; kind: string; message: string; created_at: string }
export interface Suggestion {
  id: string;
  kind: 'reminder' | 'risk' | 'question' | 'followup' | 'idea';
  title: string;
  body: string | null;
  card_id: string | null;
  status: string;
  created_at: string;
}
export interface PendingAction {
  id: string;
  action: 'delete_card' | 'delete_memory' | 'confirm_link';
  target_id: string;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
  created_at: string;
}
export type WeatherKind = 'clear' | 'partly' | 'clouds' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export interface Weather {
  place: string | null;
  locationSource?: string;
  lat?: number;
  lon?: number;
  temp: number;
  feelsLike: number | null;
  kind: WeatherKind;
  label: string;
  isDay: boolean;
  cloudCover: number | null;
  sunrise: string | null;
  sunset: string | null;
  todayMax: number | null;
  todayMin: number | null;
  rainChance: number | null;
  tomorrow: { kind: WeatherKind; label: string; max: number | null; min: number | null; rainChance: number | null } | null;
}
export interface Today {
  meetings: { at: string; title: string }[];
  critical: { id: string; title: string; requested_by: string | null }[];
  due: { id: string; title: string; due_date: string; overdue: boolean }[];
  awaitingReply: number;
  waitingOthers: number;
  review: number;
  weather: Weather | null;
}
export interface WikiPageMeta { id: string; slug: string; title: string; kind: string; summary: string; links: string[]; updated_at: string }
export interface WikiPageFull extends WikiPageMeta { content: string; sources: SourceRef[] }

export interface DayCard { id: string; title: string; requested_by: string | null; due_date: string | null; priority: Priority; status: CardStatus }
export interface DaySummary {
  today: string;
  tomorrow: string;
  closed: DayCard[];
  created: DayCard[];
  progressed: DayCard[];
  carry: DayCard[];
  dueTomorrow: DayCard[];
  meetingsTomorrow: { at: string; title: string }[];
  review: number;
  mailsToday: number;
  weather: Weather | null;
}
export interface DayEndResult { steps: { key: string; ok: boolean; note?: string }[]; summary: DaySummary }

export interface Nudge { id: string; title: string; message: string; created_at: string }

export interface Briefing { id: string; kind: 'morning' | 'tracker' | 'weekly' | 'reflection'; headline: string; content: string; stats: Record<string, number>; created_at: string }
export interface Memory {
  id: string;
  kind: 'soul_core' | 'soul' | 'user' | 'memory' | 'lesson' | 'person' | 'project';
  key: string | null;
  content: string;
  original_excerpt: string | null;
  importance: number;
  strength: number;
  locked: boolean;
  last_recalled_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface JournalEntry { id: string; day: string; content: string; created_at: string }
export interface ChatSession { id: string; title: string; updated_at: string }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; tools: string[]; created_at: string }
export interface AgentRun { id: string; kind: string; status: string; started_at: string; finished_at: string | null; error: string | null; stats: Record<string, unknown> }

export interface UsageWindow { utilization: number | null; resetsAt: string | null; status: string }
export interface Usage {
  status: string;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  extra: Record<string, UsageWindow>;
  updatedAt: string;
}

export interface Status {
  user: { name: string; title: string; role: string };
  store: 'supabase' | 'local';
  supabase: boolean;
  timezone: string;
  run: {
    running: string | null;
    step: string;
    startedAt: string | null;
    log: { at: string; text: string }[];
    lastResult: null | { kind: string; status: string; at: string; message: string };
  };
  schedule: {
    lastMorning: string | null;
    lastCollect: string | null;
    backfillDone: string | null;
    nextTracker: string | null;
    enabled: boolean;
    schedule: { morningTime: string; workEnd: string; trackerEveryHours: number };
  };
  labels: { status: Record<CardStatus, string>; stats: Record<string, string> };
  usage: Usage | null;
  models?: { chat: string; think: string; scan: string };
  usagePauseAt?: number;
  tts: { provider: 'azure' | 'browser'; voice: string; voices?: { id: string; label: string; note: string }[]; usage: { month: string; chars: number; limit: number } | null };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body ? JSON.stringify(body) : undefined });

export const api = {
  status: () => req<Status>('/status'),
  board: (all = false) => req<{ cards: Card[]; projects: Project[] }>(`/board${all ? '?all=1' : ''}`),
  createCard: (c: Partial<Card> & { title: string; project?: string }) => req<Card>('/cards', json('POST', c)),
  updateCard: (id: string, patch: Partial<Card> & { project?: string }) => req<Card>(`/cards/${id}`, json('PATCH', patch)),
  deleteCard: (id: string, noise = false) => req(`/cards/${id}${noise ? '?feedback=noise' : ''}`, json('DELETE')),
  activity: (id: string) => req<Activity[]>(`/cards/${id}/activity`),
  briefing: () => req<{ morning: Briefing | null; weekly: Briefing | null; reflection: Briefing | null; updates: Briefing[] }>('/briefing'),
  suggestions: () => req<Suggestion[]>('/suggestions'),
  actions: () => req<PendingAction[]>('/actions'),
  today: () => req<Today>('/today'),
  weather: () => req<Weather | null>('/weather'),
  setLocation: (lat: number, lon: number, place?: string) => req<Weather | null>('/location', json('POST', { lat, lon, place })),
  wiki: () => req<WikiPageMeta[]>('/wiki'),
  wikiPage: (slug: string) =>
    req<{ page: WikiPageFull; backlinks: { slug: string; title: string; kind: string }[]; cards: { id: string; title: string; status: CardStatus }[] }>(
      `/wiki/${encodeURIComponent(slug)}`,
    ),
  resolveAction: (id: string, decision: 'approve' | 'reject') => req(`/actions/${id}/${decision}`, json('POST')),
  updateSuggestion: (id: string, status: string, lesson?: string) =>
    req(`/suggestions/${id}`, json('PATCH', { status, lesson })),
  run: (kind: 'morning' | 'tracker' | 'backfill' | 'wiki' | 'weekly' | 'reflection') => req(`/run/${kind}`, json('POST')),
  nudges: () => req<Nudge[]>('/nudges'),
  daySummary: () => req<DaySummary>('/day/summary'),
  endDay: () => req<DayEndResult>('/day/end', json('POST')),
  closeApp: () => req('/app/close', json('POST')),
  dayState: () => req<{ dayEnded: string | null }>('/day/state'),
  diagVoice: (report: unknown) => req('/diag/voice', json('POST', report)),
  briefingFollowup: (unanswered: string[], skipped: boolean) => req<{ ok: boolean; id: string }>('/briefing/followup', json('POST', { unanswered, skipped })),
  seenNudge: (id: string) => req(`/nudges/${id}/seen`, json('POST')),
  presence: (visible: boolean) => req('/presence', json('POST', { visible })),
  refreshUsage: () => req<Usage | null>('/usage/refresh', json('POST')),
  runs: () => req<AgentRun[]>('/runs'),
  memory: () => req<{ memories: Memory[]; journal: JournalEntry[] }>('/memory'),
  addMemory: (m: Partial<Memory>) => req<Memory>('/memory', json('POST', m)),
  updateMemory: (id: string, m: Partial<Memory>) => req<Memory>(`/memory/${id}`, json('PATCH', m)),
  deleteMemory: (id: string) => req(`/memory/${id}`, json('DELETE')),
  chatSessions: () => req<ChatSession[]>('/chat/sessions'),
  chatMessages: (id: string) => req<ChatMessage[]>(`/chat/sessions/${id}/messages`),
  deleteChat: (id: string) => req(`/chat/sessions/${id}`, json('DELETE')),
};

export type ChatStreamEvent =
  | { type: 'session'; id: string; title: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; label: string }
  | { type: 'tool_done'; label: string; ms: number }
  | { type: 'done'; text: string; isError: boolean };

/** POST /api/chat SSE akışını okur. */
export interface ChatRef {
  kind: 'card' | 'wiki';
  id: string;
  title: string;
}

export async function streamChat(
  body: { sessionId?: string | null; message: string; ref?: ChatRef | null },
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Sohbet başlatılamadı (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
