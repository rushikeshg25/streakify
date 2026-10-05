import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationError, databaseConnection } from '../server/config';

const valid = { hosted: true, password: 'test-password-123', secret: 'test-secret-'.repeat(4), databaseUrl: 'postgresql://user:password@localhost/streakify?sslmode=require' };
test('deployment checks required secrets and PostgreSQL configuration without exposing values', () => {
  assert.equal(configurationError(valid), undefined);
  assert.equal(configurationError({ hosted: false }), undefined);
  assert.match(configurationError({ ...valid, password: 'short' })!, /APP_PASSWORD/);
  assert.match(configurationError({ ...valid, secret: '' })!, /SESSION_SECRET/);
  assert.match(configurationError({ ...valid, databaseUrl: '' })!, /DATABASE_URL is missing/);
  for (const databaseUrl of ['https://example.com/db', 'postgresql://localhost', 'not-a-url']) {
    const message = configurationError({ ...valid, databaseUrl })!;
    assert.match(message, /valid PostgreSQL/);
    assert.equal(message.includes(databaseUrl), false);
  }
});


test('build and runtime accept the managed Vercel Postgres connection without copying secrets', () => {
  const managed = 'postgresql://test:password@localhost/managed';
  assert.equal(databaseConnection({ POSTGRES_URL: managed }), managed);
  assert.equal(databaseConnection({ DATABASE_URL: '', POSTGRES_URL: managed }), managed);
  assert.equal(databaseConnection({ DATABASE_URL: valid.databaseUrl, POSTGRES_URL: managed }), valid.databaseUrl);
  assert.equal(databaseConnection({}), undefined);
  assert.equal(configurationError({ ...valid, databaseUrl: databaseConnection({ POSTGRES_URL: managed }) }), undefined);
});
