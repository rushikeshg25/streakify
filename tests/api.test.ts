import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApi } from '../server/api';
import { createStore } from '../server/store';
import { newState } from '../shared/model';

test('HTTP API protects all data, validates origins, limits login, and supports signed sessions', async () => {
  const store = createStore(':memory:');
  const password = 'test-private-password';
  const app = createApi({ store, password, secret: 'test-secret-'.repeat(4) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, cookie = '', origin = base) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, body: JSON.stringify(body) });
  try {
    for (const path of ['/api/state', '/api/export', '/api/export/csv']) assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await post('/api/import', newState())).status, 401);
    assert.equal((await post('/api/command', {})).status, 401);
    assert.equal((await post('/api/auth', { password }, '', 'https://unrelated.example')).status, 403);
    assert.equal((await post('/api/auth', { password: 'incorrect' })).status, 401);
    const login = await post('/api/auth', { password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await fetch(base + '/api/state', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await post('/api/import', { invalid: true }, cookie)).status, 400);
    assert.equal((await post('/api/command', { requestId: 'test', command: { type: 'settings.save', settings: { ...newState().settings, name: 'Test' } } }, cookie)).status, 200);
    assert.equal(store.read().settings.name, 'Test');
    const exported = await fetch(base + '/api/export', { headers: { Cookie: cookie } });
    assert.match(exported.headers.get('cache-control')!, /no-store/);
    assert.match(exported.headers.get('content-disposition')!, /attachment/);
    const csv = await fetch(base + '/api/export/csv', { headers: { Cookie: cookie } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type')!, /text\/csv/);
    assert.match(await csv.text(), /"Date","Habit"/);
    assert.equal((await post('/api/auth', { logout: true }, cookie)).headers.get('set-cookie')?.includes('Max-Age=0'), true);
    for (let i = 0; i < 8; i++) await post('/api/auth', { password: 'incorrect' });
    assert.equal((await post('/api/auth', { password })).status, 429);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('hosted configuration fails closed without a password and secret', async () => {
  const app = createApi({ store: createStore(':memory:'), hosted: true, password: '', secret: '' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/state`);
    assert.equal(response.status, 503);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('HEAD requests support uptime checks without requiring a JSON body', async () => {
  const store = createStore(':memory:');
  const server = createApi({ store, password: '', secret: '' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
