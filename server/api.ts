import express from 'express';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import type { Command, State } from '../shared/model';
import { createSession, sameSecret, validSession } from './auth';

export type Store = {
  read(): State | Promise<State>;
  command(requestId: string, command: Command): State | Promise<State>;
  restore(raw: unknown): State | Promise<State>;
  allowLogin?(key: string): Promise<boolean>;
};

export function createApi(options: { store?: Store; hosted?: boolean; password?: string; secret?: string } = {}) {
  const app = express();
  const hosted = options.hosted ?? !!process.env.VERCEL;
  const password = options.password ?? process.env.APP_PASSWORD;
  const secret = options.secret ?? process.env.SESSION_SECRET;
  const secured = !!password;
  let storePromise: Promise<Store> | undefined;
  const attempts = new Map<string, { count: number; until: number }>();
  async function store(): Promise<Store> {
    storePromise ??= (async () => {
      if (options.store) return options.store;
      if (process.env.DATABASE_URL) {
        const { createPostgresStore } = await import('./postgres'); return createPostgresStore(process.env.DATABASE_URL);
      }
      if (hosted) throw new Error('DATABASE_URL is missing. Add your PostgreSQL connection in Vercel settings.');
      const { createStore } = await import('./store'); return createStore(process.env.STREAKIFY_DB ?? resolve('data/streakify.sqlite'));
    })().catch(error => { storePromise = undefined; throw error; });
    return storePromise;
  }
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if ((hosted || secured) && (!password || password.length < 12 || !secret || secret.length < 32)) {
      res.status(503).json({ error: 'Private workspace setup is incomplete. Set APP_PASSWORD (at least 12 characters) and SESSION_SECRET (at least 32 characters) in your server environment.' }); return;
    }
    if (!hosted && !['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) { res.status(403).json({ error: 'Use localhost to access the development server.' }); return; }
    if (req.method !== 'GET') {
      const origin = req.get('origin');
      const expected = `${hosted ? 'https' : 'http'}://${req.get('host')}`;
      if (origin && origin !== expected) { res.status(403).json({ error: 'This request must come from Streakify.' }); return; }
      if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON data.' }); return; }
    }
    next();
  });
  app.use('/api', express.json({ limit: '4mb' }));
  app.get('/api/auth', (req, res) => res.json({ required: secured, authenticated: !secured || validSession(req.get('cookie'), secret!, password!) }));
  app.post('/api/auth', async (req, res) => {
    if (!secured) { res.json({ authenticated: true }); return; }
    if (req.body?.logout) {
      res.setHeader('Set-Cookie', `streakify_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${hosted ? '; Secure' : ''}`);
      res.json({ authenticated: false }); return;
    }
    const ip = hosted ? req.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown' : req.socket.remoteAddress ?? 'local';
    const key = createHmac('sha256', secret!).update(ip).digest('hex');
    const db = await store();
    let allowed: boolean;
    if (db.allowLogin) allowed = await db.allowLogin(key);
    else {
      for (const [id, attempt] of attempts) if (attempt.until < Date.now()) attempts.delete(id);
      const entry = attempts.get(key) ?? { count: 0, until: Date.now() + 15 * 60 * 1000 };
      entry.count++; attempts.set(key, entry); allowed = entry.count <= 10;
    }
    if (!allowed) { res.setHeader('Retry-After', '900'); res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }); return; }
    if (typeof req.body?.password !== 'string' || !sameSecret(req.body.password, password!)) { res.status(401).json({ error: 'That password didn’t match. Try again.' }); return; }
    res.setHeader('Set-Cookie', `streakify_session=${createSession(secret!, password!)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${hosted ? '; Secure' : ''}`);
    res.json({ authenticated: true });
  });
  app.use('/api', (req, res, next) => {
    if (secured && !validSession(req.get('cookie'), secret!, password!)) { res.status(401).json({ error: 'Sign in to your private workspace.' }); return; } next();
  });
  app.get('/api/state', async (_req, res) => res.json(await (await store()).read()));
  app.get('/api/export', async (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="streakify-backup.json"'); res.json(await (await store()).read());
  });
  app.post('/api/command', async (req, res) => {
    if (typeof req.body?.requestId !== 'string' || req.body.requestId.length > 100 || !req.body.requestId) { res.status(400).json({ error: 'A request ID is required.' }); return; }
    res.json(await (await store()).command(req.body.requestId, req.body.command));
  });
  app.post('/api/import', async (req, res) => res.json(await (await store()).restore(req.body)));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'This action does not exist.' }));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const isDatabaseError = /connect|database|ECONN|ENOTFOUND|timeout|relation|password authentication/i.test(error.message);
    const message = error instanceof ZodError ? error.issues[0]?.message : isDatabaseError ? 'The database could not be reached. Check the server connection and try again.' : error.message;
    res.status(isDatabaseError ? 503 : 400).json({ error: message || 'The change could not be saved.' });
  });
  return app;
}
