/**
 * Kurulum kontrolü: npm run doctor  (canlı test için: npm run doctor -- --live)
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { accessSync, constants, mkdirSync } from 'node:fs';
import { config, DATA_DIR, hasSupabase, M365_FORBIDDEN_TOOLS, ROOT } from './config.js';
import { configProblems, runProblems } from './health.js';
import { runClaude } from './claude/runner.js';
import { getStore } from './store/index.js';

const okMark = (s: string) => console.log(`  ✅ ${s}`);
const warn = (s: string) => console.log(`  ⚠️  ${s}`);
const bad = (s: string) => console.log(`  ❌ ${s}`);
let problems = 0;

console.log('\n☀️  Güneş kurulum kontrolü\n');

const [maj, min] = process.versions.node.split('.').map(Number);
maj > 22 || (maj === 22 && min >= 15)
  ? okMark(`Node.js ${process.versions.node}`)
  : (bad(`Node.js 22.15+ gerekli (şu an ${process.versions.node}) — kurumsal sertifika desteği için`), problems++);

existsSync(join(ROOT, '.env')) ? okMark('.env dosyası var') : warn('.env yok — .env.example dosyasını .env olarak kopyalayın');

try {
  const v = execSync(`"${config.claudeBin}" --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  okMark(`Claude Code CLI: ${v}`);
} catch {
  bad(`'${config.claudeBin}' bulunamadı. Claude Code'u kurun ve 'claude' ile bir kez giriş yapın (claude.ai hesabınızla).`);
  problems++;
}

if (hasSupabase) {
  try {
    await getStore().listProjects();
    try {
      await getStore().listPendingActions();
      try {
        await getStore().listWikiPages();
        await getStore().getThreadLinks(['-']);
        // 0004: haftalık rapor/iç gözlem brifing türleri
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
        const probe = await sb.from('briefings').insert({ kind: 'weekly', headline: 'doctor', content: '', stats: {} }).select('id').maybeSingle();
        if (probe.data?.id) await sb.from('briefings').delete().eq('id', probe.data.id);
        if (probe.error) {
          bad("Supabase: haftalık rapor türü yok → supabase/migrations/0004_weekly.sql dosyasını SQL Editor'de çalıştırın");
          problems++;
        } else okMark('Supabase bağlantısı ve şema tamam');
        // 0005: takvim bitiş saati (odak planı) — yoksa Güneş yine çalışır, süreyi 60 dk varsayar
        const ends = await sb.from('events').select('ends_at').limit(1);
        if (ends.error) warn("Supabase: 'events.ends_at' yok → odak planı toplantı sürelerini 60 dk varsayar. İsterseniz supabase/migrations/0005_event_end.sql dosyasını SQL Editor'de çalıştırın");
      } catch {
        bad("Supabase: wiki tabloları yok → supabase/migrations/0003_attribution_wiki.sql dosyasını SQL Editor'de çalıştırın");
        problems++;
      }
    } catch {
      bad("Supabase: 'pending_actions' tablosu yok → önce 0002_pending_actions.sql, sonra 0003_attribution_wiki.sql dosyasını SQL Editor'de çalıştırın");
      problems++;
    }
  } catch (e) {
    // Ağ hatası mı, şema hatası mı? Doğrudan deneyip nedeni göster.
    const cause = await fetch(`${config.supabaseUrl}/rest/v1/`)
      .then(() => null)
      .catch((err: { cause?: { code?: string; message?: string } }) => err.cause);
    if (cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN' || cause?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY') {
      bad('Supabase: şirket ağı SSL denetimi yapıyor ve Node bu sertifikaya güvenmiyor.\n     → Komutları npm üzerinden çalıştırın (npm start / npm run doctor); --use-system-ca ayarı otomatik eklenir.');
    } else if (cause) {
      bad(`Supabase'e ulaşılamıyor: ${cause.code ?? ''} ${cause.message ?? ''}\n     → .env içindeki SUPABASE_URL doğru mu? Ağ/güvenlik duvarı engelliyor olabilir.`);
    } else {
      bad(`Supabase: ${(e as Error).message}\n     → supabase/migrations/0001_init.sql dosyasını SQL Editor'de çalıştırdınız mı?`);
    }
    problems++;
  }
} else warn('Supabase ayarlı değil — yerel dosya modu (data/local-db.json) kullanılacak');

existsSync(join(ROOT, 'server', 'dist', 'mcp.js')) ? okMark('Sunucu derlenmiş') : (bad('Sunucu derlenmemiş: npm run build'), problems++);
existsSync(join(ROOT, 'web', 'dist', 'index.html')) ? okMark('Arayüz derlenmiş') : (bad('Arayüz derlenmemiş: npm run build'), problems++);

if (config.azureSpeechKey) {
  try {
    const { synthesize } = await import('./tts.js');
    const audio = await synthesize('Merhaba, ben Güneş.');
    okMark(`Doğal ses (Azure Speech, ${config.ttsVoice}): çalışıyor (${Math.round(audio.length / 1024)} KB)`);
  } catch (e) {
    bad(`Doğal ses (Azure Speech): ${(e as Error).message}`);
    problems++;
  }
} else warn('Doğal ses ayarlı değil (AZURE_SPEECH_KEY) — tarayıcı sesi kullanılacak');


// ---- Ayarlar, veri klasörü, çalışan sunucu ve son hatalar
{
  const issues = configProblems(config);
  issues.length ? issues.forEach((i) => (bad(i), problems++)) : okMark('Zamanlama ve eşik ayarları tutarlı');

  try {
    mkdirSync(DATA_DIR, { recursive: true });
    accessSync(DATA_DIR, constants.W_OK);
    okMark(`Veri klasörü yazılabilir (${DATA_DIR})`);
  } catch {
    bad(`Veri klasörüne yazılamıyor: ${DATA_DIR}`);
    problems++;
  }

  if (!M365_FORBIDDEN_TOOLS.includes('outlook_send_mail') || !M365_FORBIDDEN_TOOLS.includes('teams_send_channel_message')) {
    bad('Güvenlik: yasaklı M365 araç listesi daraltılmış (config.ts → M365_FORBIDDEN_TOOLS)');
    problems++;
  } else okMark('Güvenlik: gönderme/silme araçları yasak listesinde');

  config.teamsSelfChatId ? okMark('Teams özet sohbeti ayarlı') : warn('GUNES_TEAMS_SELF_CHAT_ID yok — sabah özeti Teams\'e gönderilmeyecek (isteğe bağlı)');

  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(3000) });
    const h = (await res.json()) as { problems: { kind: string; error: string }[] };
    okMark(`Güneş sunucusu çalışıyor (http://localhost:${config.port})`);
    for (const p of h.problems) warn(`Son ${p.kind} çalışması hata verdi: ${p.error.slice(0, 160)}`);
  } catch {
    warn(`Güneş sunucusu şu an çalışmıyor (port ${config.port}) — npm start ile başlatın`);
    try {
      for (const p of runProblems(await getStore().listRuns(60))) warn(`Son ${p.kind} çalışması hata vermiş: ${p.error.slice(0, 160)}`);
    } catch {
      /* depo okunamadıysa yukarıda bildirildi */
    }
  }
}

if (process.argv.includes('--live')) {
  console.log('\n  Canlı test: Claude (Haiku) ile Microsoft 365 connector deneniyor…');
  let tools: string[] = [];
  let servers: { name: string; status: string }[] = [];
  const res = await runClaude({
    prompt: 'get_me aracını çağır ve sadece kullanıcının adını ve e-posta adresini tek satırda yaz.',
    model: config.modelScan,
    preset: 'collector',
    timeoutMs: 3 * 60_000,
    onEvent: (e) => {
      if (e.type === 'init') {
        tools = e.tools;
        servers = e.mcp;
      }
    },
  });
  const gunes = servers.find((s) => s.name === 'gunes');
  gunes?.status === 'connected' ? okMark('Güneş MCP sunucusu bağlandı') : (bad(`Güneş MCP sunucusu: ${gunes?.status ?? 'yok'}`), problems++);
  const m365Tool = tools.find((t) => t.endsWith('__outlook_email_search'));
  if (!m365Tool) {
    bad("Microsoft 365 araçları görünmüyor. claude.ai → Ayarlar → Connectors'ta Microsoft 365 bağlı mı? Claude Code'a claude.ai hesabıyla mı giriş yaptınız?");
    console.log('     Görülen MCP sunucuları:', servers.map((s) => `${s.name} (${s.status})`).join(', ') || '-');
    problems++;
  } else {
    const server = m365Tool.split('__')[1];
    if (server !== config.m365Server) {
      bad(`Connector sunucu adı farklı: .env dosyasına GUNES_M365_SERVER=${server} yazın.`);
      problems++;
    } else okMark(`Microsoft 365 connector: ${server}`);
  }
  res.isError ? (bad(`Claude cevabı: ${res.text.slice(0, 300)}`), problems++) : okMark(`Claude cevabı: ${res.text.trim().slice(0, 200)}`);
}

console.log(problems ? `\n${problems} sorun bulundu.\n` : '\nHer şey hazır görünüyor. ☀️\n');
// process.exit yerine exitCode: Windows'ta kapanış sırasında libuv assertion hatasını önler
process.exitCode = problems ? 1 : 0;
