import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyCommand, validateBackup } from '../shared/commands.js';
import { newState } from '../shared/model.js';
import type { Command, State } from '../shared/model.js';

const collections = ['habits', 'entries', 'rewards', 'redemptions', 'transactions'] as const;
export function createStore(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  for (const table of collections) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`);
  db.prepare('INSERT OR IGNORE INTO settings VALUES (1, ?)').run(JSON.stringify(newState().settings));

  function read(): State {
    const state = newState();
    state.settings = JSON.parse((db.prepare('SELECT payload FROM settings WHERE id=1').get() as { payload: string }).payload);
    for (const table of collections) (state[table] as unknown[]) = (db.prepare(`SELECT payload FROM ${table} ORDER BY rowid`).all() as { payload: string }[]).map(r => JSON.parse(r.payload));
    return state;
  }
  function persist(state: State, previous: State) {
    db.prepare('UPDATE settings SET payload=? WHERE id=1').run(JSON.stringify(state.settings));
    for (const table of collections) {
      const old = new Map(previous[table].map(item => [item.id, JSON.stringify(item)]));
      const next = new Set(state[table].map(item => item.id));
      const save = db.prepare(`INSERT INTO ${table} (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`);
      for (const item of state[table]) if (old.get(item.id) !== JSON.stringify(item)) save.run(item.id, JSON.stringify(item));
      for (const key of old.keys()) if (!next.has(key)) db.prepare(`DELETE FROM ${table} WHERE id=?`).run(key);
    }
  }
  function transaction<T>(action: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {
    read,
    command(requestId: string, command: Command, now?: Date) {
      return transaction(() => {
        const previous = read();
        const existing = db.prepare('SELECT body FROM requests WHERE id=?').get(requestId) as { body: string } | undefined;
        if (existing) {
          if (existing.body !== JSON.stringify(command)) throw new Error('This request ID was already used. Refresh and try again.');
          return previous;
        }
        const state = applyCommand(previous, command, now);
        persist(state, previous);
        db.prepare('INSERT INTO requests (id,body) VALUES (?,?)').run(requestId, JSON.stringify(command));
        return state;
      });
    },
    restore(raw: unknown) {
      const next = validateBackup(raw);
      return transaction(() => { persist(next, read()); db.exec('DELETE FROM requests'); return next; });
    },
    close() { db.close(); },
  };
}
