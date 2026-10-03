import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const date = new Date(s + 'T12:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
}, 'Choose a valid date.');
const id = z.string().min(1).max(100);
const amount = z.number().int().min(0).max(100000);
export const ruleSchema = z.object({
  type: z.enum(['check', 'count', 'duration']), target: z.number().int().min(1).max(10000),
  unit: z.string().trim().min(1).max(24), schedule: z.enum(['daily', 'weekdays', 'weekly']),
  days: z.array(z.number().int().min(0).max(6)).max(7), weeklyTarget: z.number().int().min(1).max(7),
  xp: amount.nullable(), coins: amount.nullable(),
}).refine(r => r.schedule !== 'weekdays' || r.days.length > 0, 'Select at least one weekday.');
export type Rule = z.infer<typeof ruleSchema>;
const versionSchema = z.object({ effective: dateSchema, rule: ruleSchema });
export const habitInputSchema = z.object({
  name: z.string().trim().min(1).max(70), category: z.string().trim().min(1).max(30),
  icon: z.enum(['book', 'water', 'move', 'mind', 'sun', 'code', 'leaf', 'heart']),
  color: z.enum(['purple', 'blue', 'orange', 'green', 'pink']), rule: ruleSchema,
});
export type HabitInput = z.infer<typeof habitInputSchema>;
export const habitSchema = habitInputSchema.omit({ rule: true }).extend({
  id, created: dateSchema, order: z.number().int().min(0), archived: z.boolean(),
  versions: z.array(versionSchema).min(1).max(10000),
  pauses: z.array(z.object({ start: dateSchema, end: dateSchema.nullable() })),
});
export type Habit = z.infer<typeof habitSchema>;
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(40), timezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
  }, 'Choose a valid timezone.'),
  weekStart: z.union([z.literal(0), z.literal(1)]), theme: z.enum(['light', 'dark', 'system']),
  defaultXp: amount, defaultCoins: amount, levelSize: z.number().int().min(10).max(100000),
  showXp: z.boolean(), showCoins: z.boolean(), showStreaks: z.boolean(),
  streakBonus: z.number().int().min(0).max(100),
});
export type Settings = z.infer<typeof settingsSchema>;
export const entrySchema = z.object({
  id, habitId: id, date: dateSchema, value: amount, rule: ruleSchema,
  xp: z.number().int().min(0).max(200000), coins: amount, complete: z.boolean(), rested: z.boolean(),
});
export type Entry = z.infer<typeof entrySchema>;
export const rewardInputSchema = z.object({
  name: z.string().trim().min(1).max(70), description: z.string().trim().max(140),
  cost: z.number().int().min(1).max(100000), icon: z.enum(['coffee', 'film', 'gift', 'game', 'food', 'trip']),
  limit: z.enum(['none', 'daily', 'weekly']),
});
export type RewardInput = z.infer<typeof rewardInputSchema>;
export const rewardSchema = rewardInputSchema.extend({ id, archived: z.boolean() });
export type Reward = z.infer<typeof rewardSchema>;
export const redemptionSchema = z.object({ id, rewardId: id, name: z.string().max(70), cost: amount, date: dateSchema, undone: z.boolean() });
export const transactionSchema = z.object({ id, sourceId: id, date: dateSchema, xp: z.number().int(), coins: z.number().int(), reason: z.string().max(200) });
export const stateSchema = z.object({
  schemaVersion: z.literal(1), settings: settingsSchema, habits: z.array(habitSchema).max(1000),
  entries: z.array(entrySchema).max(100000), rewards: z.array(rewardSchema).max(1000),
  redemptions: z.array(redemptionSchema).max(100000), transactions: z.array(transactionSchema).max(200000),
});
export type State = z.infer<typeof stateSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('habit.save'), habitId: id.optional(), input: habitInputSchema }),
  z.object({ type: z.literal('habit.archive'), habitId: id, archived: z.boolean() }),
  z.object({ type: z.literal('habit.pause'), habitId: id, paused: z.boolean() }),
  z.object({ type: z.literal('habit.move'), habitId: id, direction: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('entry.set'), habitId: id, date: dateSchema, value: amount, rested: z.boolean().optional() }),
  z.object({ type: z.literal('reward.save'), rewardId: id.optional(), input: rewardInputSchema }),
  z.object({ type: z.literal('reward.archive'), rewardId: id }),
  z.object({ type: z.literal('reward.redeem'), rewardId: id }),
  z.object({ type: z.literal('redemption.undo'), redemptionId: id }),
  z.object({ type: z.literal('settings.save'), settings: settingsSchema }),
]);
export type Command = z.infer<typeof commandSchema>;

export function todayIn(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)!.value).join('-');
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function weekday(date: string): number { return new Date(date + 'T12:00:00Z').getUTCDay(); }
export function weekOf(date: string, start: number): string { return addDays(date, -((weekday(date) - start + 7) % 7)); }
export function ruleAt(habit: Habit, date: string): Rule {
  return [...habit.versions].reverse().find(v => v.effective <= date)?.rule ?? habit.versions[0].rule;
}
export function isPaused(habit: Habit, date: string): boolean { return habit.pauses.some(p => p.start <= date && (!p.end || date < p.end)); }
export function isScheduled(habit: Habit, date: string): boolean {
  const rule = ruleAt(habit, date);
  return date >= habit.created && !isPaused(habit, date) && (rule.schedule !== 'weekdays' || rule.days.includes(weekday(date)));
}
export function entryFor(state: State, habitId: string, date: string): Entry | undefined { return state.entries.find(e => e.habitId === habitId && e.date === date); }
export function weeklyCompletions(state: State, habitId: string, date: string): number {
  const start = weekOf(date, state.settings.weekStart);
  return state.entries.filter(e => e.habitId === habitId && e.complete && e.date >= start && e.date < addDays(start, 7)).length;
}
export function isDue(state: State, habit: Habit, date: string): boolean {
  if (habit.archived || !isScheduled(habit, date)) return false;
  const rule = ruleAt(habit, date);
  return rule.schedule !== 'weekly' || weeklyCompletions(state, habit.id, date) < rule.weeklyTarget || !!entryFor(state, habit.id, date)?.value;
}
export function streak(state: State, habit: Habit, date: string): number {
  let count = 0;
  let cursor = date;
  if (ruleAt(habit, date).schedule === 'weekly') {
    cursor = weekOf(date, state.settings.weekStart);
    while (addDays(cursor, 6) >= habit.created) {
      const reference = cursor < habit.created ? habit.created : cursor;
      const rule = ruleAt(habit, reference);
      if (rule.schedule !== 'weekly') break;
      const met = weeklyCompletions(state, habit.id, cursor) >= rule.weeklyTarget;
      const allPaused = Array.from({ length: 7 }, (_, i) => addDays(cursor, i)).every(d => d < habit.created || isPaused(habit, d) || entryFor(state, habit.id, d)?.rested);
      if (met) count++; else if (!allPaused && cursor !== weekOf(date, state.settings.weekStart)) break;
      cursor = addDays(cursor, -7);
    }
    return count;
  }
  while (cursor >= habit.created) {
    if (ruleAt(habit, cursor).schedule === 'weekly') break;
    if (isScheduled(habit, cursor)) {
      const entry = entryFor(state, habit.id, cursor);
      if (entry?.complete) count++; else if (!entry?.rested && cursor !== date) break;
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}
export function balances(state: State) {
  return state.transactions.reduce((s, t) => ({ xp: s.xp + t.xp, coins: s.coins + t.coins }), { xp: 0, coins: 0 });
}
export function rewardAvailable(state: State, reward: Reward, date: string): boolean {
  return reward.limit === 'none' || !state.redemptions.some(r => r.rewardId === reward.id && !r.undone && (reward.limit === 'daily' ? r.date === date : weekOf(r.date, state.settings.weekStart) === weekOf(date, state.settings.weekStart)));
}
export function newState(timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): State {
  return { schemaVersion: 1, settings: { name: 'Friend', timezone, weekStart: 1, theme: 'light', defaultXp: 20, defaultCoins: 5, levelSize: 100, showXp: true, showCoins: true, showStreaks: true, streakBonus: 0 }, habits: [], entries: [], rewards: [], redemptions: [], transactions: [] };
}
export const defaultRule: Rule = { type: 'check', target: 1, unit: 'times', schedule: 'daily', days: [1, 2, 3, 4, 5], weeklyTarget: 3, xp: null, coins: null };
export const templates: HabitInput[] = [
  { name: 'Read a little', category: 'Learning', icon: 'book', color: 'purple', rule: { ...defaultRule, type: 'duration', target: 20, unit: 'minutes' } },
  { name: 'Stay hydrated', category: 'Health', icon: 'water', color: 'blue', rule: { ...defaultRule, type: 'count', target: 8, unit: 'glasses' } },
  { name: 'Move your body', category: 'Fitness', icon: 'move', color: 'orange', rule: { ...defaultRule, schedule: 'weekly', weeklyTarget: 3 } },
  { name: 'A moment of calm', category: 'Mindfulness', icon: 'mind', color: 'green', rule: { ...defaultRule, type: 'duration', target: 10, unit: 'minutes' } },
];
