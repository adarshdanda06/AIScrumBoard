import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@aiscrumboard/db';
import { getEnv } from './env.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
let _client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!_db) {
    const env = getEnv();
    _client = postgres(env.DATABASE_URL, { max: 10 });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end();
    _client = undefined;
    _db = undefined;
  }
}

export type DB = ReturnType<typeof getDb>;
