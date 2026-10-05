import { addDays, balances, commandSchema, entryFor, isPaused, isScheduled, newState, rewardAvailable, ruleAt, stateSchema, streak, todayIn, weekOf, weeklyCompletions } from './model.js';
import type { Command, Habit, State } from './model.js';

export function applyCommand(previous: State, raw: Command, now = new Date(), uuid = () => crypto.randomUUID()): State {
  const command = commandSchema.parse(raw);
  const state = structuredClone(previous);
  const today = todayIn(state.settings.timezone, now);
  function habitById(id: string): Habit {
    const habit = state.habits.find(h => h.id === id);
    if (!habit) throw new Error('This habit no longer exists. Refresh and try again.');
    return habit;
  }
  function transaction(sourceId: string, xp: number, coins: number, reason: string) {
    if (xp || coins) state.transactions.push({ id: uuid(), sourceId, xp, coins, reason, date: today });
  }
  switch (command.type) {
    case 'habit.save': {
      const { rule, ...details } = command.input;
      if (rule.type === 'check') { rule.target = 1; rule.unit = 'times'; }
      if (rule.type === 'duration') rule.unit = 'minutes';
      if (!command.habitId) {
        state.habits.push({ ...details, id: uuid(), created: today, order: state.habits.length, archived: false, pauses: [], versions: [{ effective: today, rule }] });
      } else {
        const habit = habitById(command.habitId);
        Object.assign(habit, details);
        const active = ruleAt(habit, today);
        // Weekly periods keep one set of rules until the following week.
        const effective = active.schedule === 'weekly' || rule.schedule === 'weekly' ? addDays(weekOf(today, state.settings.weekStart), 7) : addDays(today, 1);
        habit.versions = habit.versions.filter(v => v.effective <= today);
        if (JSON.stringify(active) !== JSON.stringify(rule)) habit.versions.push({ effective, rule });
      }
      break;
    }
    case 'habit.archive': habitById(command.habitId).archived = command.archived; break;
    case 'habit.pin': habitById(command.habitId).pinned = command.pinned; break;
    case 'habit.pause': {
      const habit = habitById(command.habitId);
      if (command.paused && !isPaused(habit, today)) habit.pauses.push({ start: today, end: null });
      if (!command.paused) habit.pauses.forEach(p => { if (!p.end) p.end = today; });
      break;
    }
    case 'habit.move': {
      const ordered = state.habits.filter(h => !h.archived).sort((a, b) => a.order - b.order);
      const index = ordered.findIndex(h => h.id === command.habitId);
      const other = index + (command.direction === 'up' ? -1 : 1);
      if (index >= 0 && other >= 0 && other < ordered.length) {
        [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
        ordered.forEach((h, i) => { h.order = i; });
      }
      break;
    }
    case 'entry.set': {
      const habit = habitById(command.habitId);
      const old = entryFor(state, habit.id, command.date);
      if (command.date > today || command.date < habit.created) throw new Error('Choose a date between the habit’s creation and today.');
      const clearing = command.value === 0 && !command.rested;
      if (!clearing && (habit.archived || !isScheduled(habit, command.date))) throw new Error('This habit is not scheduled on this date.');
      const rule = old?.rule ?? ruleAt(habit, command.date);
      const value = command.rested ? 0 : Math.min(command.value, rule.target);
      const complete = value >= rule.target && !command.rested;
      if (complete && !old?.complete && rule.schedule === 'weekly' && weeklyCompletions(state, habit.id, command.date) >= rule.weeklyTarget) throw new Error('You’ve already met this week’s target.');
      const note = command.note ?? old?.note;
      const entry = { id: old?.id ?? uuid(), habitId: habit.id, date: command.date, value, rule, complete, rested: !!command.rested, xp: old?.xp ?? 0, coins: old?.coins ?? 0, ...(note ? { note } : {}) };
      if (complete && !old?.complete) {
        entry.xp = rule.xp ?? state.settings.defaultXp;
        entry.coins = rule.coins ?? state.settings.defaultCoins;
        const previousStreak = streak(state, habit, command.date);
        if (previousStreak > 0) entry.xp += Math.floor(entry.xp * state.settings.streakBonus / 100);
      }
      if (!complete) { entry.xp = 0; entry.coins = 0; }
      transaction(entry.id, entry.xp - (old?.xp ?? 0), entry.coins - (old?.coins ?? 0), `${complete ? 'Completed' : command.rested ? 'Rest day' : 'Updated'}: ${habit.name}`);
      state.entries = state.entries.filter(e => e.id !== entry.id);
      if (value || entry.rested) state.entries.push(entry);
      break;
    }
    case 'entry.note': {
      const entry = state.entries.find(e => e.id === command.entryId);
      if (!entry) throw new Error('This check-in no longer exists. Refresh and try again.');
      if (command.note) entry.note = command.note;
      else delete entry.note;
      break;
    }
    case 'reward.save': {
      if (command.rewardId) {
        const reward = state.rewards.find(r => r.id === command.rewardId);
        if (!reward) throw new Error('This reward no longer exists.');
        Object.assign(reward, command.input);
      } else state.rewards.push({ ...command.input, id: uuid(), archived: false });
      break;
    }
    case 'reward.archive': {
      const reward = state.rewards.find(r => r.id === command.rewardId);
      if (!reward) throw new Error('This reward no longer exists.');
      reward.archived = command.archived ?? true;
      break;
    }
    case 'reward.redeem': {
      const reward = state.rewards.find(r => r.id === command.rewardId && !r.archived);
      if (!reward) throw new Error('This reward is no longer available.');
      if (balances(state).coins < reward.cost) throw new Error('Keep going! You need a few more coins for this reward.');
      if (!rewardAvailable(state, reward, today)) throw new Error('You’ve reached this reward’s redemption limit.');
      const redemption = { id: uuid(), rewardId: reward.id, name: reward.name, cost: reward.cost, date: today, undone: false };
      state.redemptions.push(redemption);
      transaction(redemption.id, 0, -reward.cost, `Redeemed: ${reward.name}`);
      break;
    }
    case 'redemption.undo': {
      const redemption = state.redemptions.find(r => r.id === command.redemptionId);
      if (!redemption) throw new Error('This redemption no longer exists.');
      if (!redemption.undone) { redemption.undone = true; transaction(redemption.id, 0, redemption.cost, `Returned: ${redemption.name}`); }
      break;
    }
    case 'settings.save': {
      // A new week boundary would reinterpret completed weekly periods.
      if (command.settings.weekStart !== state.settings.weekStart && state.entries.length) throw new Error('Week start is locked after your first check-in to preserve weekly history.');
      state.settings = command.settings;
      break;
    }
  }
  return state;
}

export function validateBackup(raw: unknown): State {
  const state = stateSchema.parse(raw);
  for (const list of [state.habits, state.entries, state.rewards, state.redemptions, state.transactions]) {
    if (new Set(list.map(item => item.id)).size !== list.length) throw new Error('Backup contains duplicate IDs.');
  }
  if (new Set(state.entries.map(e => `${e.habitId}:${e.date}`)).size !== state.entries.length) throw new Error('Backup contains duplicate check-ins.');
  for (const habit of state.habits) {
    if (habit.versions[0].effective !== habit.created || habit.versions.some((v, i) => i > 0 && v.effective <= habit.versions[i - 1].effective)) throw new Error('Backup contains invalid habit rule dates.');
    if (habit.pauses.some(p => p.end && p.end < p.start)) throw new Error('Backup contains an invalid pause.');
  }
  for (const entry of state.entries) {
    const habit = state.habits.find(h => h.id === entry.habitId);
    if (!habit || entry.date < habit.created || entry.value > entry.rule.target || entry.complete !== (entry.value >= entry.rule.target && !entry.rested) || (entry.rested && entry.value !== 0) || (!entry.complete && (entry.xp || entry.coins))) throw new Error('Backup contains an invalid check-in.');
  }
  for (const r of state.redemptions) if (!state.rewards.some(reward => reward.id === r.rewardId)) throw new Error('Backup contains an unknown reward.');
  const totals = balances(state);
  const xp = state.entries.reduce((sum, e) => sum + e.xp, 0);
  const coins = state.entries.reduce((sum, e) => sum + e.coins, 0) - state.redemptions.filter(r => !r.undone).reduce((sum, r) => sum + r.cost, 0);
  if (totals.xp !== xp || totals.coins !== coins) throw new Error('Backup balances do not match its history.');
  return state;
}

export { newState };
