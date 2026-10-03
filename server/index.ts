import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApi } from './api';

if (existsSync('.env')) loadEnvFile('.env');
const app = express();
app.use(createApi());
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT ?? 5173);
app.listen(port, '127.0.0.1', () => console.log(`Streakify is ready at http://localhost:${port}`));
