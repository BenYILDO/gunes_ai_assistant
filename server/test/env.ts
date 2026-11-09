/** Testler gerçek verilere dokunmasın: geçici veri klasörü + Supabase kapalı. Her test dosyasında İLK import olmalı. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_DATA_DIR = process.env.GUNES_DATA_DIR || mkdtempSync(join(tmpdir(), 'gunes-test-'));
process.env.GUNES_DATA_DIR = TEST_DATA_DIR;
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.GUNES_SCHEDULER = 'off';
