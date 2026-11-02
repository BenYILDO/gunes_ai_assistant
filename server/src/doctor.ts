/**
 * Kurulum kontrolü: npm run doctor  (canlı test için: npm run doctor -- --live)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, hasSupabase, ROOT } from './config.js';
import { runClaude } from './claude/runner.js';
import { getStore } from './store/index.js';

const okMark = (s: string) => console.log(`  ✅ ${s}`);
const warn = (s: string) => console.log(`  ⚠️  ${s}`);
const bad = (s: string) => console.log(`  ❌ ${s}`);
let problems = 0;

console.log('\n☀️  Güneş kurulum kontrolü\n');

const major = Number(process.versions.node.split('.')[0]);
major >= 20 ? okMark(`Node.js ${process.versions.node}`) : (bad(`Node.js 20+ gerekli (şu an ${process.versions.node})`), problems++);

existsSync(join(ROOT, '.env')) ? okMark('.env dosyası var') : warn('.env yok — .env.example dosyasını .env olarak kopyalayın');

try {
  const isWin = process.platform === 'win32';
  const v = execFileSync(config.claudeBin, ['--version'], { encoding: 'utf8', shell: isWin && !/\.exe$/i.test(config.claudeBin) }).trim();
  okMark(`Claude Code CLI: ${v}`);
} catch {
  bad(`'${config.claudeBin}' bulunamadı. Claude Code'u kurun ve 'claude' ile bir kez giriş yapın (claude.ai hesabınızla).`);
  problems++;
}

if (hasSupabase) {
  try {
    await getStore().listProjects();
    okMark('Supabase bağlantısı ve şema tamam');
  } catch (e) {
    bad(`Supabase: ${(e as Error).message}\n     → supabase/migrations/0001_init.sql dosyasını SQL Editor'de çalıştırdınız mı?`);
    problems++;
  }
} else warn('Supabase ayarlı değil — yerel dosya modu (data/local-db.json) kullanılacak');

existsSync(join(ROOT, 'server', 'dist', 'mcp.js')) ? okMark('Sunucu derlenmiş') : (bad('Sunucu derlenmemiş: npm run build'), problems++);
existsSync(join(ROOT, 'web', 'dist', 'index.html')) ? okMark('Arayüz derlenmiş') : (bad('Arayüz derlenmemiş: npm run build'), problems++);

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
process.exit(problems ? 1 : 0);
