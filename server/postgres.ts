import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { postgresConnectionString } from './postgres-config.js';
import { applyCommand, validateBackup } from '../shared/commands.js';
import { newState } from '../shared/model.js';
import type { Command, State } from '../shared/model.js';

export function createPostgresStore(connectionString: string) {
  async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = new Pool({ connectionString: postgresConnectionString(connectionString), max: 1, connectionTimeoutMillis: 10000 });
    let client: PoolClient | undefined;
    try { client = await pool.connect(); return await fn(client); }
    finally { client?.release(); await pool.end(); }
  }
  let initialized: Promise<void> | undefined;
  async function init() {
    initialized ??= withClient(async client => {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(7139462)');
        await client.query('CREATE TABLE IF NOT EXISTS streakify_workspace (id INTEGER PRIMARY KEY CHECK(id=1), payload JSONB NOT NULL)');
        await client.query('CREATE TABLE IF NOT EXISTS streakify_requests (id TEXT PRIMARY KEY, body JSONB NOT NULL)');
        await client.query('CREATE TABLE IF NOT EXISTS streakify_login_attempts (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start TIMESTAMPTZ NOT NULL)');
        // Supabase exposes public-schema tables through its Data API. Only the table owner
        // (the server connection) should access this single-user workspace.
        for (const table of ['streakify_workspace', 'streakify_requests', 'streakify_login_attempts']) {
          await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        }
        await client.query('INSERT INTO streakify_workspace VALUES (1, $1) ON CONFLICT DO NOTHING', [JSON.stringify(newState())]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }).catch(error => { initialized = undefined; throw error; });
    await initialized;
  }
  async function transaction<T>(fn: (client: PoolClient, state: State) => Promise<T>): Promise<T> {
    await init();
    return withClient(async client => {
      await client.query('BEGIN');
      try {
        const result = await client.query('SELECT payload FROM streakify_workspace WHERE id=1 FOR UPDATE');
        const value = await fn(client, result.rows[0].payload);
        await client.query('COMMIT'); return value;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }
  return {
    async read(): Promise<State> {
      await init(); return withClient(async client => (await client.query('SELECT payload FROM streakify_workspace WHERE id=1')).rows[0].payload);
    },
    async command(requestId: string, command: Command, now?: Date): Promise<State> {
      return transaction(async (client, previous) => {
        const result = await client.query('SELECT body = $2::jsonb AS matches FROM streakify_requests WHERE id=$1', [requestId, JSON.stringify(command)]);
        if (result.rows.length) {
          if (!result.rows[0].matches) throw new Error('This request ID was already used. Refresh and try again.');
          return previous;
        }
        const state = applyCommand(previous, command, now);
        await client.query('UPDATE streakify_workspace SET payload=$1 WHERE id=1', [JSON.stringify(state)]);
        await client.query('INSERT INTO streakify_requests (id,body) VALUES ($1,$2)', [requestId, JSON.stringify(command)]);
        return state;
      });
    },
    async restore(raw: unknown): Promise<State> {
      const next = validateBackup(raw);
      return transaction(async client => {
        await client.query('UPDATE streakify_workspace SET payload=$1 WHERE id=1', [JSON.stringify(next)]);
        await client.query('DELETE FROM streakify_requests'); return next;
      });
    },
    async allowLogin(key: string): Promise<boolean> {
      await init();
      return withClient(async client => {
        const result = await client.query(`INSERT INTO streakify_login_attempts VALUES ($1,1,NOW())
          ON CONFLICT (id) DO UPDATE SET
          attempts=CASE WHEN streakify_login_attempts.window_start < NOW()-INTERVAL '15 minutes' THEN 1 ELSE streakify_login_attempts.attempts+1 END,
          window_start=CASE WHEN streakify_login_attempts.window_start < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE streakify_login_attempts.window_start END
          RETURNING attempts`, [key]);
        await client.query("DELETE FROM streakify_login_attempts WHERE window_start < NOW()-INTERVAL '1 day'");
        return result.rows[0].attempts <= 10;
      });
    },
  };
}
