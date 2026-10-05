import { test, expect } from '@playwright/test';
import { createSession } from '../../server/auth';
import { applyCommand } from '../../shared/commands';
import { addDays, defaultRule, isDue, newState, ruleAt, templates, todayIn } from '../../shared/model';

function populatedWorkspace() {
  const today = todayIn('UTC');
  const now = new Date(`${today}T12:00:00Z`);
  const created = new Date(`${addDays(today, -14)}T12:00:00Z`);
  let state = newState('UTC');
  state.settings.name = 'Avery With A Very Long Display Name';
  for (const input of [...templates, { name: 'Build a deliberate daily practice with enough room for a busy life', category: 'Personal growth and wellbeing', icon: 'leaf' as const, color: 'green' as const, rule: defaultRule }]) {
    state = applyCommand(state, { type: 'habit.save', input }, created);
  }
  for (let offset = -6; offset <= 0; offset++) {
    const date = addDays(today, offset);
    for (const [index, habit] of state.habits.entries()) {
      if ((offset + index) % 2 === 0 && isDue(state, habit, date)) state = applyCommand(state, { type: 'entry.set', habitId: habit.id, date, value: ruleAt(habit, date).target }, now);
    }
  }
  if (state.entries[0]) state = applyCommand(state, { type: 'entry.note', entryId: state.entries[0].id, note: 'A useful reflection with a long link: https://example.com/' + 'a'.repeat(180) + '\nA second line to check wrapping.' }, now);
  state = applyCommand(state, { type: 'habit.pin', habitId: state.habits[0].id, pinned: true }, now);
  for (const [name, cost] of [['Coffee and a quiet afternoon with a new book', 40], ['A weekend adventure somewhere new', 150], ['An evening of games with friends', 80]] as const) {
    state = applyCommand(state, { type: 'reward.save', input: { name, cost, description: 'Something worth showing up for, saved a little at a time.', icon: 'gift', limit: 'weekly' } }, now);
  }
  return state;
}

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`all screens fit a ${width}px viewport in both themes`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'This matrix explicitly covers every viewport; workflow tests cover mobile browser settings.');
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const token = createSession('e2e-only-session-secret-not-for-deployment', 'e2e-workspace-password');
    await context.addCookies([{ name: 'streakify_session', value: token, domain: '127.0.0.1', path: '/' }]);
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1080 });
    for (const theme of ['light', 'dark'] as const) {
      const state = populatedWorkspace();
      state.settings.theme = theme;
      expect((await context.request.post('/api/import', { data: state })).ok()).toBeTruthy();
      await page.goto('/');
      await page.reload();
      const headings = { today: 'Make today count.', habits: 'Small habits. Your rules.', progress: 'Look how far you’ve come.', rewards: 'Make the effort feel good.', settings: 'Your habits. Your way.' };
      for (const [screen, heading] of Object.entries(headings)) {
        await page.goto(`/#${screen}`);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${screen}, ${theme}, ${width}px`).toBeLessThanOrEqual(width);
        const overflow = await page.locator('main .panel, main .habit-row, main .reward-card, main .week-strip').evaluateAll(elements => elements.filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.right > window.innerWidth + 1 || rect.left < -1;
        }).map(element => element.className));
        expect(overflow, `${screen}, ${theme}, ${width}px: overflowing panels`).toEqual([]);
        if ([390, 1920].includes(width)) await page.screenshot({ path: `test-results/layout-${width}-${theme}-${screen}.png`, fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });
}
