import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../shared/commands';
import { defaultRule, newState } from '../shared/model';
import { weeklyReview } from '../shared/insights';

function fixture() {
  let state = newState('UTC');
  for (const name of ['Read', 'Walk']) state = applyCommand(state, { type: 'habit.save', input: { name, category: 'Personal', icon: 'leaf', color: 'green', rule: defaultRule } }, new Date('2026-09-21T12:00:00Z'));
  for (const [index, date, value, rested] of [[0, '2026-09-21', 1, false], [0, '2026-09-25', 1, false], [0, '2026-09-28', 1, false], [1, '2026-09-28', 1, false], [1, '2026-09-29', 0, true], [0, '2026-09-30', 1, false]] as const) {
    state = applyCommand(state, { type: 'entry.set', habitId: state.habits[index].id, date, value, rested }, new Date('2026-10-01T12:00:00Z'));
  }
  return state;
}
test('weekly review excludes future check-ins and compares matching weekdays', () => {
  const state = fixture();
  const review = weeklyReview(state, '2026-09-29');
  assert.equal(review.completions, 2);
  assert.equal(review.previousCompletions, 1);
  assert.equal(review.difference, 1);
  assert.equal(review.activeDays, 1);
  assert.equal(review.restDays, 1);
  assert.equal(review.xp, 40);
  assert.equal(review.previousEnd, '2026-09-22');
  assert.equal(review.leaders.length, 2);
  assert.equal(weeklyReview(state, '2026-09-29', state.habits[0].id).completions, 1);
});
test('review respects Sunday starts and handles an empty workspace without percentages', () => {
  const state = newState('UTC');
  state.settings.weekStart = 0;
  const review = weeklyReview(state, '2026-10-05');
  assert.equal(review.start, '2026-10-04');
  assert.equal(review.previousStart, '2026-09-27');
  assert.equal(review.previousEnd, '2026-09-28');
  assert.equal(review.difference, 0);
  assert.deepEqual(review.leaders, []);
});
