/** Elle çalıştırma: npm run run:morning | run:tracker | run:backfill */
import { runJob, type JobKind } from './agents/pipeline.js';

const kind = process.argv[2] as JobKind;
if (!['morning', 'tracker', 'backfill', 'wiki'].includes(kind)) {
  console.error('Kullanım: node server/dist/cli.js <morning|tracker|backfill|wiki>');
  process.exit(1);
}
await runJob(kind);
process.exit(0);
