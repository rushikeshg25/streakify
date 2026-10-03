import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createPostgresStore } from '../server/postgres';
import { balances, defaultRule, newState } from '../shared/model';
import type { Command } from '../shared/model';

// Use a dedicated test database. Each run creates and drops only its own schema.
test('PostgreSQL initializes, serializes concurrent commands, restores atomically, and shares login limits', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `streakify_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('options', `-csearch_path=${schema}`);
    const first = createPostgresStore(url.toString());
    const second = createPostgresStore(url.toString());
    await Promise.all([first.read(), second.read()]);
    await first.restore(newState('UTC'));
    const now = new Date('2026-10-03T12:00:00Z');
    const create: Command = { type: 'habit.save', input: { name: 'Read', category: 'Learning', icon: 'book', color: 'green', rule: defaultRule } };
    await Promise.all([first.command('create', create, now), second.command('create', create, now)]);
    let state = await second.read();
    assert.equal(state.habits.length, 1);
    const complete: Command = { type: 'entry.set', habitId: state.habits[0].id, date: '2026-10-03', value: 1 };
    await Promise.all([first.command('complete-a', complete, now), second.command('complete-b', complete, now)]);
    state = await first.read();
    assert.deepEqual(balances(state), { xp: 20, coins: 5 });
    assert.equal(state.entries.length, 1);
    await assert.rejects(() => second.command('create', complete, now), /already used/);
    await assert.rejects(() => second.restore({ ...state, transactions: [] }), /balances/);
    assert.deepEqual(await first.read(), state);
    await second.restore(newState('UTC'));
    assert.equal((await first.read()).habits.length, 0);
    await first.command('create', create, now);
    assert.equal((await second.read()).habits.length, 1);
    const attempts = await Promise.all(Array.from({ length: 11 }, (_, index) => (index % 2 ? first : second).allowLogin('test-client')));
    assert.equal(attempts.filter(Boolean).length, 10);
    assert.equal(await first.allowLogin('different-client'), true);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
