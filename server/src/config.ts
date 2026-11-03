import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** Repo kök dizini (server/src veya server/dist'in iki üstü). */
export const ROOT = resolve(here, '..', '..');

loadEnv({ path: join(ROOT, '.env'), quiet: true });

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const list = (k: string, d = '') =>
  env(k, d)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const DATA_DIR = join(ROOT, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const config = {
  port: Number(env('GUNES_PORT', '4317')),
  userName: env('GUNES_USER_NAME', 'Yıldıray'),
  userTitle: env('GUNES_USER_TITLE', 'Bey'),
  userRole: env('GUNES_USER_ROLE', 'IT / Dijital Dönüşüm'),
  timezone: env('GUNES_TIMEZONE', 'Europe/Istanbul'),

  supabaseUrl: env('SUPABASE_URL'),
  supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),

  claudeBin: env('CLAUDE_BIN', 'claude'),
  modelScan: env('GUNES_MODEL_SCAN', 'haiku'),
  modelThink: env('GUNES_MODEL_THINK', 'sonnet'),
  modelChat: env('GUNES_MODEL_CHAT', 'sonnet'),

  /** Claude Code içinde claude.ai Microsoft 365 connector'ının sunucu adı. `npm run doctor` doğrular. */
  m365Server: env('GUNES_M365_SERVER', 'claude_ai_Microsoft_365'),
  teamsSelfChatId: env('GUNES_TEAMS_SELF_CHAT_ID'),

  schedule: {
    enabled: env('GUNES_SCHEDULER', 'on') !== 'off',
    morningTime: env('GUNES_MORNING_TIME', '08:30'),
    workEnd: env('GUNES_WORK_END', '18:00'),
    trackerEveryHours: Number(env('GUNES_TRACKER_EVERY_HOURS', '2')),
    /** 1=Pazartesi … 7=Pazar */
    workDays: list('GUNES_WORK_DAYS', '1,2,3,4,5').map(Number),
  },
  /** Toplantı hazırlığı (başlamadan ~15 dk önce) ve toplantı sonrası aksiyonlar */
  meetingPrep: env('GUNES_MEETING_PREP', 'on') !== 'off',
  meetingFollowup: env('GUNES_MEETING_FOLLOWUP', 'on') !== 'off',
  /** Haftalık rapor + iç gözlem: gün (1=Pzt … 5=Cuma) ve saat */
  weeklyDay: Number(env('GUNES_WEEKLY_DAY', '5')),
  weeklyTime: env('GUNES_WEEKLY_TIME', '16:30'),
  backfillDays: Number(env('GUNES_BACKFILL_DAYS', '45')),
  backfillChunkDays: Number(env('GUNES_BACKFILL_CHUNK_DAYS', '7')),
  /** Geçmiş taramasında aynı anda çalışan toplayıcı sayısı (sadece Supabase modunda) */
  backfillParallel: Number(env('GUNES_BACKFILL_PARALLEL', '3')),
  /** 5 saatlik kullanım bu oranı geçerse 2 saatlik takip ertelenir (sohbete yer kalsın) */
  usagePauseAt: Number(env('GUNES_USAGE_PAUSE_AT', '0.85')),

  /** Doğal ses (Azure Speech F0, ücretsiz): portal.azure.com → Speech service → Keys and Endpoint */
  azureSpeechKey: env('AZURE_SPEECH_KEY'),
  azureSpeechRegion: env('AZURE_SPEECH_REGION', 'westeurope'),
  ttsVoice: env('GUNES_TTS_VOICE', 'tr-TR-EmelNeural'),
  ttsRate: env('GUNES_TTS_RATE', '0%'),
  ttsPitch: env('GUNES_TTS_PITCH', '0%'),
  /** Ücretsiz kota 500 bin; güvenlik payıyla bu sınırda tarayıcı sesine dönülür */
  ttsMonthlyLimit: Number(env('GUNES_TTS_MONTHLY_LIMIT', '450000')),

  vipPeople: list('GUNES_VIP_PEOPLE'),
  ignoreSenders: list('GUNES_IGNORE', 'noreply,no-reply,newsletter,bulten,notification,bildirim'),
};

export const hasSupabase = Boolean(config.supabaseUrl && config.supabaseKey);

/** M365 connector'ının salt-okuma araçları. */
export const M365_READ_TOOLS = [
  'outlook_email_search',
  'outlook_calendar_search',
  'chat_message_search',
  'teams_list_chats',
  'teams_list_teams',
  'teams_list_channels',
  'teams_list_channel_messages',
  'read_resource',
  'get_me',
  'search_people',
];
/** Taslak araçları: kullanıcı onayıyla gönderilir, kendisi göndermez. */
export const M365_DRAFT_TOOLS = ['outlook_create_draft', 'outlook_create_reply_draft', 'outlook_create_reply_all_draft'];
/** Asla verilmeyecek araçlar (savunma amaçlı açıkça yasaklanır). */
export const M365_FORBIDDEN_TOOLS = [
  'outlook_send_mail',
  'outlook_send_draft',
  'outlook_forward_mail',
  'outlook_batch_delete_messages',
  'outlook_trash_thread',
  'outlook_delete_event',
  'outlook_create_event',
  'outlook_update_event',
  'outlook_respond_to_event',
  'outlook_set_vacation',
  'outlook_create_filter',
  'outlook_delete_filter',
  'teams_send_channel_message',
  'teams_reply_channel_message',
  'teams_create_chat',
  'sharepoint_delete_item',
  'sharepoint_upload_file',
  'sharepoint_update_file',
  'sharepoint_move_item',
];

export const m365 = (tool: string) => `mcp__${config.m365Server}__${tool}`;
export const gunesTool = (tool: string) => `mcp__gunes__${tool}`;
