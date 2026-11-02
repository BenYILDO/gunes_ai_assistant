import { join } from 'node:path';
import { config, DATA_DIR, hasSupabase } from '../config.js';
import { LocalStore } from './local.js';
import { SupabaseStore } from './supabase.js';
import type { Store } from './types.js';

export * from './types.js';

let instance: Store | null = null;

export function getStore(): Store {
  if (!instance) {
    instance = hasSupabase
      ? new SupabaseStore(config.supabaseUrl, config.supabaseKey)
      : new LocalStore(join(DATA_DIR, 'local-db.json'));
  }
  return instance;
}
