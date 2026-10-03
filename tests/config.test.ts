import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationError } from '../server/config';

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
