import { addDays, weekOf } from './model.js';
import type { State } from './model.js';

// Compare equivalent elapsed portions of adjacent weeks, never a partial week to a full one.
export function weeklyReview(state: State, today: string, habitId = 'all') {
  const start = weekOf(today, state.settings.weekStart);
  const previousStart = addDays(start, -7);
  const previousEnd = addDays(today, -7);
  const entries = state.entries.filter(entry => habitId === 'all' || entry.habitId === habitId);
  const current = entries.filter(entry => entry.date >= start && entry.date <= today);
  const previous = entries.filter(entry => entry.date >= previousStart && entry.date <= previousEnd);
  const completions = current.filter(entry => entry.complete);
  const previousCompletions = previous.filter(entry => entry.complete).length;
  const habitCounts = new Map<string, number>();
  for (const entry of completions) habitCounts.set(entry.habitId, (habitCounts.get(entry.habitId) ?? 0) + 1);
  const leaders = state.habits.filter(habit => habitCounts.has(habit.id)).map(habit => ({
    id: habit.id, name: habit.name, icon: habit.icon, color: habit.color, count: habitCounts.get(habit.id)!,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);
  return {
    start, previousStart, previousEnd,
    completions: completions.length,
    previousCompletions,
    difference: completions.length - previousCompletions,
    activeDays: new Set(completions.map(entry => entry.date)).size,
    restDays: new Set(current.filter(entry => entry.rested).map(entry => entry.date)).size,
    xp: current.reduce((total, entry) => total + entry.xp, 0),
    leaders,
  };
}
