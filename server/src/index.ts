import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.js';
import { apiRouter } from './api.js';
import { ensureSoul } from './agents/soul.js';
import { startScheduler } from './scheduler.js';
import { getStore } from './store/index.js';

const app = express();
// DNS rebinding koruması: sadece localhost adlarıyla gelen isteklere cevap ver
const allowedHosts = new Set([`localhost:${config.port}`, `127.0.0.1:${config.port}`, `[::1]:${config.port}`]);
app.use((req, res, next) => {
  if (!allowedHosts.has(String(req.headers.host))) return void res.status(403).send('Forbidden');
  next();
});
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
await ensureSoul(store);

// Sadece bu bilgisayardan erişilebilir (127.0.0.1)
app.listen(config.port, '127.0.0.1', () => {
  console.log(`\n☀️  Güneş hazır → http://localhost:${config.port}`);
  console.log(`   Veri deposu: ${store.mode === 'supabase' ? 'Supabase' : 'yerel dosya (data/local-db.json)'}`);
  startScheduler();
});
