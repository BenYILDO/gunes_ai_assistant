import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.js';
import { apiRouter } from './api.js';
import { ensureSoul } from './agents/soul.js';
import { hostGuard, originGuard } from './security.js';
import { startScheduler } from './scheduler.js';
import { getStore } from './store/index.js';

const app = express();
// DNS rebinding + CSRF koruması (bkz. security.ts)
app.use(hostGuard(config.port));
app.use('/api', originGuard(config.port));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter());

const webDist = join(ROOT, 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.send('Arayüz henüz derlenmedi. <code>npm run build</code> çalıştırın ya da geliştirme için <code>npm run dev</code>.'),
  );
}

const store = getStore();
try {
  await ensureSoul(store);
  // Önceki oturumda sunucu kapanırken süren çalışmalar "çalışıyor" olarak takılı kalmasın
  const stale = await store.closeStaleRuns('Sunucu kapandığı için yarıda kaldı');
  if (stale) console.log(`[güneş] ${stale} yarıda kalmış çalışma kapatıldı.`);
} catch (e) {
  // Veritabanına ulaşılamasa bile arayüz açılsın; hata loglansın ve doctor ile incelensin.
  console.error('[güneş] Veri deposuna bağlanılamadı:', (e as Error).message, '→ npm run doctor');
}

// Sadece bu bilgisayardan erişilebilir (127.0.0.1)
app.listen(config.port, '127.0.0.1', () => {
  console.log(`\n☀️  Güneş hazır → http://localhost:${config.port}`);
  console.log(`   Veri deposu: ${store.mode === 'supabase' ? 'Supabase' : 'yerel dosya (data/local-db.json)'}`);
  startScheduler();
});
