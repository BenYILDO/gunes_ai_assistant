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

/** Veri klasörü; testler GUNES_DATA_DIR ile geçici klasör kullanır. */
export const DATA_DIR = process.env.GUNES_DATA_DIR?.trim() ? resolve(process.env.GUNES_DATA_DIR.trim()) : join(ROOT, 'data');
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
  /** Odak planı: mesai başlangıcı ve öğle arası (boş bırakılırsa öğle arası yok), örn. 12:30-13:30 */
  workStart: env('GUNES_WORK_START', '09:00'),
  lunch: env('GUNES_LUNCH', '12:30-13:30'),
  /** Toplantı hazırlığı (başlamadan ~15 dk önce) ve toplantı sonrası aksiyonlar */
  meetingPrep: env('GUNES_MEETING_PREP', 'on') !== 'off',
  meetingFollowup: env('GUNES_MEETING_FOLLOWUP', 'on') !== 'off',
  /** Haftalık rapor + iç gözlem: gün (1=Pzt … 5=Cuma) ve saat */
  weeklyDay: Number(env('GUNES_WEEKLY_DAY', '5')),
  weeklyTime: env('GUNES_WEEKLY_TIME', '16:30'),
  /** Haftalık rapor ayrıca bu klasöre de yazılır (ör. OneDrive yolu); boşsa sadece data/wiki/raporlar */
  reportDir: env('GUNES_REPORT_DIR'),
  backfillDays: Number(env('GUNES_BACKFILL_DAYS', '45')),
  backfillChunkDays: Number(env('GUNES_BACKFILL_CHUNK_DAYS', '7')),
  /** Geçmiş taramasında aynı anda çalışan toplayıcı sayısı (sadece Supabase modunda) */
  backfillParallel: Number(env('GUNES_BACKFILL_PARALLEL', '3')),
  /** 5 saatlik kullanım bu oranı geçerse 2 saatlik takip ertelenir (sohbete yer kalsın) */
  usagePauseAt: Number(env('GUNES_USAGE_PAUSE_AT', '0.85')),
  /** Düşük öncelikli işler (geçmiş tarama, wiki, toplantı sonrası, iç gözlem) bu oranda ertelenir */
  usageDeferAt: Number(env('GUNES_USAGE_DEFER_AT', '0.70')),

  /** Doğal ses (Azure Speech F0, ücretsiz): portal.azure.com → Speech service → Keys and Endpoint */
  azureSpeechKey: env('AZURE_SPEECH_KEY'),
  azureSpeechRegion: env('AZURE_SPEECH_REGION', 'westeurope'),
  ttsVoice: env('GUNES_TTS_VOICE', 'tr-TR-EmelNeural'),
  ttsRate: env('GUNES_TTS_RATE', '0%'),
  ttsPitch: env('GUNES_TTS_PITCH', '0%'),
  /** Ücretsiz kota 500 bin; güvenlik payıyla bu sınırda tarayıcı sesine dönülür */
  ttsMonthlyLimit: Number(env('GUNES_TTS_MONTHLY_LIMIT', '450000')),

  /**
   * Toplantı kaydı → yerel transkript + konuşmacı tanıma (bkz. server/src/meetings/, scripts/whisper/RAPOR.md).
   * Her şey bu bilgisayarda çalışır: whisper.cpp, ffmpeg, sherpa-onnx (embedding) ve Python (yalnızca standart kütüphane).
   */
  meetings: {
    /** whisper-cli.exe, ffmpeg.exe, sherpa-onnx-c-api.dll ve model dosyalarının (alt klasörler dahil) bulunduğu kök */
    toolsDir: env('GUNES_WHISPER_DIR', join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'whisper-cpp')),
    whisperModel: env('GUNES_WHISPER_MODEL', 'ggml-large-v3-turbo-q5_0.bin'),
    vadModel: env('GUNES_WHISPER_VAD', 'ggml-silero-v6.2.0.bin'),
    /** Konuşmacı vektörü modeli (TitaNet small: ölçümlerde en iyi) */
    embeddingModel: env('GUNES_EMBEDDING_MODEL', 'nemo_en_titanet_small.onnx'),
    python: env('GUNES_PYTHON', 'python'),
    threads: Number(env('GUNES_WHISPER_THREADS', '8')),
    /** Bu benzerliğin altındaki ses "tanınmadı" sayılır (iki toplantıda ölçüldü: 0,40-0,45 en dengeli) */
    voiceThreshold: Number(env('GUNES_VOICE_THRESHOLD', '0.40')),
    /** Transkript bağlam iyileştirme (Haiku): yanlış duyulmuş özel isim/terimleri bağlamla düzeltir; rakamlara dokunmaz, özgün metin saklanır */
    refine: env('GUNES_REFINE', 'on') !== 'off',
    /** Transkript hazır olunca Güneş özet çıkarır ve kart/wiki/hafıza ÖNERİLERİ sunar (onaysız hiçbir şey yazılmaz) */
    autoAnalyze: env('GUNES_AUTO_ANALYZE', 'on') !== 'off',
    /** Ses dosyası (özgün kayıt + wav) bu kadar gün sonra silinir; transkript, özet ve wiki kalır. 0 = hiç silme */
    audioRetentionDays: Number(env('GUNES_AUDIO_RETENTION_DAYS', '30')),
    /** Canlı dinleme sesi tarayıcı yerine Güneş sunucusunun kendisi yakalar (ekran paylaşımı/izin yok). off = eski tarayıcı yöntemi */
    nativeCapture: env('GUNES_NATIVE_CAPTURE', 'on') !== 'off',
    /** Mikrofon cihazı adından bir parça (boşsa Windows'un varsayılan iletişim mikrofonu) */
    micDevice: env('GUNES_MIC_DEVICE'),
    /** Arama algılama: Windows'un mikrofon kullanım kaydını izler; arama başlayınca Güneş "katılmamı ister misiniz?" diye sorar */
    callWatch: env('GUNES_CALL_WATCH', 'on') !== 'off',
    /** Arama algılanınca Windows'ta kendi başına çıkan "katılmamı ister misiniz?" penceresi (Güneş penceresi kapalı/arkada olsa da görünür). off = yalnızca tarayıcı popup'ı */
    callPopup: env('GUNES_CALL_POPUP', 'on') !== 'off',
    /** Takvimdeki toplantıdan bu kadar saniye önce (aramanın çalmasını beklemeden) "katılayım mı?" diye sorar. 0 = kapalı */
    preCallLeadSec: Math.max(0, Number(env('GUNES_PRECALL_LEAD_SEC', '60')) || 0),
    /** "Katıl" denince arama penceresinin görüntüsü alınıp Claude'a verilerek arayanın adı okunur (görüntü saklanmaz). off = kapalı */
    callScreenshot: env('GUNES_CALL_SCREENSHOT', 'on') !== 'off',
    /** Hangi uygulamaların mikrofon kullanımı "arama" sayılır (tarayıcılar Güneş'in kendi sesli komutuyla karışmasın diye yok) */
    callApps: list('GUNES_CALL_APPS', 'msteams,zoom,webex,skype,slack'),
    /** Panelde "klasörden seç" için taranan klasör (ör. OneDrive Toplantılar); boşsa kapalı */
    recordingsDir: env('GUNES_RECORDINGS_DIR'),
  },

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
