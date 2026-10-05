import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, validateBackup } from '../shared/commands';
import { addDays, balances, defaultRule, isDue, newState, ruleAt, streak, todayIn, weekOf } from '../shared/model';
import type { HabitInput, Rule, State } from '../shared/model';
import { createStore } from '../server/store';
import { createSession, validSession } from '../server/auth';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const at = (date: string) => new Date(`${date}T12:00:00Z`);
function habit(rule: Partial<Rule> = {}, date = '2026-09-28') {
  return applyCommand(newState('UTC'), { type: 'habit.save', input: { name: 'Read', category: 'Learning', icon: 'book', color: 'purple', rule: { ...defaultRule, ...rule } } }, at(date));
}
function log(state: State, date: string, value = 1, rested = false) { return applyCommand(state, { type: 'entry.set', habitId: state.habits[0].id, date, value, rested }, at(date)); }
function input(state: State, change: Partial<Rule>): HabitInput { const h = state.habits[0]; return { name: h.name, category: h.category, icon: h.icon, color: h.color, rule: { ...h.versions[0].rule, ...change } }; }

test('local days and week boundaries respect timezone, DST, month and year changes', () => {
  assert.equal(todayIn('Asia/Kolkata', new Date('2026-09-30T19:00:00Z')), '2026-10-01');
  assert.equal(todayIn('America/New_York', new Date('2026-03-08T06:59:00Z')), '2026-03-08');
  assert.equal(todayIn('America/New_York', new Date('2026-03-08T07:01:00Z')), '2026-03-08');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekOf('2026-10-04', 1), '2026-09-28');
  assert.equal(weekOf('2026-10-04', 0), '2026-10-04');
});
test('partial progress earns once, duplicate completions do not earn twice, undo reverses', () => {
  let state = habit({ type: 'duration', target: 20, unit: 'minutes' });
  state = log(state, '2026-09-28', 10); assert.deepEqual(balances(state), { xp: 0, coins: 0 });
  state = log(state, '2026-09-28', 20); assert.deepEqual(balances(state), { xp: 20, coins: 5 });
  state = log(state, '2026-09-28', 20); assert.equal(state.transactions.length, 1);
  state = log(state, '2026-09-28', 10); assert.deepEqual(balances(state), { xp: 0, coins: 0 });
  state = log(state, '2026-09-28', 0); assert.equal(state.entries.length, 0);
  assert.doesNotThrow(() => validateBackup(state));
});
test('weekday streaks ignore unscheduled days, rest days, and pauses', () => {
  let state = habit({ schedule: 'weekdays', days: [1, 3, 5] });
  state = log(state, '2026-09-28'); state = log(state, '2026-09-30');
  state = log(state, '2026-10-02', 0, true);
  assert.equal(streak(state, state.habits[0], '2026-10-04'), 2);
  state = applyCommand(state, { type: 'habit.pause', habitId: state.habits[0].id, paused: true }, at('2026-10-05'));
  assert.equal(streak(state, state.habits[0], '2026-10-08'), 2);
  assert.equal(isDue(state, state.habits[0], '2026-10-07'), false);
  state = applyCommand(state, { type: 'habit.pause', habitId: state.habits[0].id, paused: false }, at('2026-10-09'));
  state = log(state, '2026-10-09'); assert.equal(streak(state, state.habits[0], '2026-10-09'), 3);
  assert.equal(streak(state, state.habits[0], '2026-10-13'), 0);
});
test('weekly targets count distinct completed days and successful weeks', () => {
  let state = habit({ schedule: 'weekly', weeklyTarget: 3 });
  state = log(state, '2026-09-28'); state = log(state, '2026-09-29'); state = log(state, '2026-09-30');
  assert.equal(isDue(state, state.habits[0], '2026-10-01'), false);
  assert.throws(() => log(state, '2026-10-01'), /already met/);
  assert.equal(streak(state, state.habits[0], '2026-10-05'), 1);
  state = log(state, '2026-10-05'); state = log(state, '2026-10-07'); state = log(state, '2026-10-09');
  assert.equal(streak(state, state.habits[0], '2026-10-09'), 2);
  assert.equal(streak(state, state.habits[0], '2026-10-19'), 0);
});
test('weekly edits wait for the next week and daily edits preserve existing snapshots', () => {
  let state = habit({ type: 'count', target: 8 });
  state = log(state, '2026-09-28', 3);
  state = applyCommand(state, { type: 'habit.save', habitId: state.habits[0].id, input: input(state, { target: 10, xp: 40 }) }, at('2026-09-28'));
  assert.equal(ruleAt(state.habits[0], '2026-09-28').target, 8);
  assert.equal(ruleAt(state.habits[0], '2026-09-29').target, 10);
  state = log(state, '2026-09-28', 8); assert.equal(state.entries[0].xp, 20);
  state = log(state, '2026-09-29', 10); assert.equal(balances(state).xp, 60);
  let weekly = habit({ schedule: 'weekly', weeklyTarget: 3 });
  weekly = applyCommand(weekly, { type: 'habit.save', habitId: weekly.habits[0].id, input: input(weekly, { schedule: 'weekly', weeklyTarget: 5 }) }, at('2026-09-30'));
  assert.equal(ruleAt(weekly.habits[0], '2026-10-04').weeklyTarget, 3);
  assert.equal(ruleAt(weekly.habits[0], '2026-10-05').weeklyTarget, 5);
});
test('archive preserves earnings and history; old check-ins can still be undone', () => {
  let state = log(habit(), '2026-09-28');
  state = applyCommand(state, { type: 'habit.archive', habitId: state.habits[0].id, archived: true }, at('2026-09-28'));
  assert.equal(isDue(state, state.habits[0], '2026-09-28'), false);
  assert.equal(balances(state).xp, 20);
  state = log(state, '2026-09-28', 0); assert.equal(balances(state).xp, 0);
});
test('redemptions enforce affordability and weekly limits; undo refunds only once', () => {
  let state = log(habit(), '2026-09-28');
  state = applyCommand(state, { type: 'reward.save', input: { name: 'Coffee', description: '', cost: 5, icon: 'coffee', limit: 'weekly' } }, at('2026-09-28'));
  const rewardId = state.rewards[0].id;
  state = applyCommand(state, { type: 'reward.redeem', rewardId }, at('2026-09-28'));
  assert.equal(balances(state).coins, 0);
  assert.throws(() => applyCommand(state, { type: 'reward.redeem', rewardId }, at('2026-09-28')), /more coins/);
  state = log(state, '2026-09-29');
  assert.throws(() => applyCommand(state, { type: 'reward.redeem', rewardId }, at('2026-09-29')), /limit/);
  const redemptionId = state.redemptions[0].id;
  state = applyCommand(state, { type: 'redemption.undo', redemptionId }, at('2026-09-29'));
  state = applyCommand(state, { type: 'redemption.undo', redemptionId }, at('2026-09-29'));
  assert.equal(balances(state).coins, 10);
  assert.doesNotThrow(() => validateBackup(state));
});
test('undoing spent earnings produces debt without blocking correction', () => {
  let state = log(habit(), '2026-09-28');
  state = applyCommand(state, { type: 'reward.save', input: { name: 'Coffee', description: '', cost: 5, icon: 'coffee', limit: 'none' } }, at('2026-09-28'));
  state = applyCommand(state, { type: 'reward.redeem', rewardId: state.rewards[0].id }, at('2026-09-28'));
  state = log(state, '2026-09-28', 0);
  assert.deepEqual(balances(state), { xp: 0, coins: -5 });
  assert.doesNotThrow(() => validateBackup(state));
});
test('default changes do not rewrite past earnings and large bonuses can be backed up', () => {
  let state = log(habit(), '2026-09-28');
  state = applyCommand(state, { type: 'settings.save', settings: { ...state.settings, defaultXp: 100000, streakBonus: 100 } }, at('2026-09-29'));
  state = log(state, '2026-09-29');
  assert.equal(state.entries[0].xp, 20); assert.equal(state.entries[1].xp, 200000);
  assert.doesNotThrow(() => validateBackup(state));
});
test('week start locks after logging and malformed/future/unscheduled check-ins are rejected', () => {
  let state = habit({ schedule: 'weekdays', days: [1] });
  assert.throws(() => log(state, '2026-09-29'), /not scheduled/);
  assert.throws(() => applyCommand(state, { type: 'entry.set', habitId: state.habits[0].id, date: '2026-09-29', value: 1 }, at('2026-09-28')), /Choose a date/);
  assert.throws(() => log(state, '2026-02-30'), /valid date/);
  state = log(state, '2026-09-28');
  assert.throws(() => applyCommand(state, { type: 'settings.save', settings: { ...state.settings, weekStart: 0 } }), /locked/);
});
test('backups reject invalid references and inconsistent balances', () => {
  const state = log(habit(), '2026-09-28');
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => validateBackup({ ...state, habits: [] }), /invalid check-in/);
  assert.throws(() => validateBackup({ ...state, transactions: [] }), /balances/);
  assert.throws(() => validateBackup({ ...state, entries: [...state.entries, state.entries[0]] }), /duplicate/);
});
test('SQLite persists across reopen, replays request IDs safely, and rolls back invalid restores', () => {
  const dir = mkdtempSync(join(tmpdir(), 'streakify-store-'));
  try {
    const file = join(dir, 'test.sqlite');
    let store = createStore(file);
    const command = { type: 'habit.save' as const, input: input(habit(), {}) };
    store.command('request-1', command, at('2026-09-28'));
    store.command('request-1', command, at('2026-09-28'));
    assert.equal(store.read().habits.length, 1);
    assert.throws(() => store.command('request-1', { type: 'settings.save', settings: newState().settings }), /already used/);
    assert.throws(() => store.restore({ broken: true }));
    store.close(); store = createStore(file);
    assert.equal(store.read().habits.length, 1); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('private sessions reject tampering, expiration, and password changes', () => {
  const secret = 'a'.repeat(32), password = 'test-password-123';
  const token = createSession(secret, password, 1000);
  assert.equal(validSession(`streakify_session=${token}`, secret, password, 2000), true);
  assert.equal(validSession(`streakify_session=${token}bad`, secret, password, 2000), false);
  assert.equal(validSession(`streakify_session=${token}`, secret, 'changed-password', 2000), false);
  assert.equal(validSession(`streakify_session=${token}`, secret, password, 8 * 86400000), false);
});

test('weekly rest days remain visible after the weekly target is reached', () => {
  let state = habit({ schedule: 'weekly', weeklyTarget: 1 });
  state = log(state, '2026-09-28', 0, true);
  state = log(state, '2026-09-29');
  assert.equal(isDue(state, state.habits[0], '2026-09-28'), true);
});

test('backdated weekly streaks do not count completions later than the selected day', () => {
  let state = habit({ schedule: 'weekly', weeklyTarget: 2 });
  state = log(state, '2026-09-29');
  state = log(state, '2026-09-30');
  assert.equal(streak(state, state.habits[0], '2026-09-28'), 0);
  assert.equal(streak(state, state.habits[0], '2026-09-29'), 0);
  assert.equal(streak(state, state.habits[0], '2026-09-30'), 1);
});

test('notes survive progress edits and backup round trips without changing earnings', () => {
  let state = log(habit({ type: 'count', target: 8 }), '2026-09-28', 3);
  const entryId = state.entries[0].id;
  state = applyCommand(state, { type: 'entry.note', entryId, note: '  Felt better after a walk.  ' });
  state = log(state, '2026-09-28', 8);
  assert.equal(state.entries[0].note, 'Felt better after a walk.');
  assert.deepEqual(balances(state), { xp: 20, coins: 5 });
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => applyCommand(state, { type: 'entry.note', entryId, note: 'a'.repeat(501) }));
  assert.throws(() => applyCommand(state, { type: 'entry.note', entryId: 'missing', note: 'test' }), /no longer exists/);
  state = applyCommand(state, { type: 'entry.note', entryId, note: ' ' });
  assert.equal(state.entries[0].note, undefined);
  assert.deepEqual(balances(state), { xp: 20, coins: 5 });
  state = log(state, '2026-09-28', 0);
  assert.equal(state.entries.length, 0);
});

test('pinning is persistent metadata that preserves ordering and old backups', () => {
  const original = habit();
  assert.equal(validateBackup(original).habits[0].pinned, undefined);
  let state = applyCommand(original, { type: 'habit.pin', habitId: original.habits[0].id, pinned: true });
  assert.equal(validateBackup(state).habits[0].pinned, true);
  assert.equal(state.habits[0].order, original.habits[0].order);
  assert.deepEqual(state.habits[0].versions, original.habits[0].versions);
  state = applyCommand(state, { type: 'habit.pin', habitId: state.habits[0].id, pinned: false });
  assert.equal(state.habits[0].pinned, false);
});

test('archived rewards can be restored without changing past redemptions', () => {
  let state = log(habit(), '2026-09-28');
  state = applyCommand(state, { type: 'reward.save', input: { name: 'Coffee', description: '', cost: 5, icon: 'coffee', limit: 'daily' } }, at('2026-09-28'));
  const rewardId = state.rewards[0].id;
  state = applyCommand(state, { type: 'reward.redeem', rewardId }, at('2026-09-28'));
  const redemptions = structuredClone(state.redemptions);
  state = applyCommand(state, { type: 'reward.archive', rewardId });
  assert.equal(state.rewards[0].archived, true);
  state = applyCommand(state, { type: 'reward.archive', rewardId, archived: false });
  assert.equal(state.rewards[0].archived, false);
  assert.deepEqual(state.redemptions, redemptions);
  assert.deepEqual(balances(state), { xp: 20, coins: 0 });
});
