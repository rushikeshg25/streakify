import type { State } from './model';

// Quote every cell and neutralize user-entered spreadsheet formulas.
function cell(value: string | number) {
  const text = String(value);
  const safe = typeof value === 'string' && (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function checkInsCsv(state: State): string {
  const habits = new Map(state.habits.map(habit => [habit.id, habit]));
  const rows: (string | number)[][] = [['Date', 'Habit', 'Category', 'Status', 'Value', 'Target', 'Unit', 'XP', 'Coins', 'Note']];
  for (const entry of [...state.entries].sort((a, b) => b.date.localeCompare(a.date) || a.habitId.localeCompare(b.habitId))) {
    const habit = habits.get(entry.habitId);
    rows.push([entry.date, habit?.name ?? 'Unknown habit', habit?.category ?? '', entry.rested ? 'Rest day' : entry.complete ? 'Completed' : 'In progress', entry.value, entry.rule.target, entry.rule.unit, entry.xp, entry.coins, entry.note ?? '']);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
