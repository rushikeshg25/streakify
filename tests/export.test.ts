import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../shared/commands';
import { newState, defaultRule } from '../shared/model';
import { checkInsCsv } from '../shared/export';

test('CSV retains notes, quotes, Unicode and values while escaping spreadsheet formulas', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  let state = applyCommand(newState('UTC'), { type: 'habit.save', input: { name: '=SUM(1,2)', category: 'Health', icon: 'leaf', color: 'green', rule: defaultRule } }, now);
  state = applyCommand(state, { type: 'entry.set', habitId: state.habits[0].id, date: '2026-10-05', value: 1 }, now);
  state = applyCommand(state, { type: 'entry.note', entryId: state.entries[0].id, note: 'A "quiet" walk, today.\nFelt great 🌿' }, now);
  const csv = checkInsCsv(state);
  assert.ok(csv.startsWith('\uFEFF"Date","Habit"'));
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"A ""quiet"" walk, today.\nFelt great 🌿"'));
  assert.ok(csv.includes('"Completed","1","1","times","20","5"'));
  assert.equal(state.habits[0].name, '=SUM(1,2)');
});
test('an empty CSV contains a header and no invented history', () => {
  const csv = checkInsCsv(newState('UTC'));
  assert.equal(csv.split('\r\n').length, 2);
  assert.ok(csv.endsWith('"Note"\r\n'));
});
