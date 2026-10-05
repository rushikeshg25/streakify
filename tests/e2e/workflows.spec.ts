import { test as base, expect } from '@playwright/test';
import { newState, defaultRule } from '../../shared/model';
import { createSession } from '../../server/auth';

const test = base.extend({ request: async ({ context }, use) => { await use(context.request); } });

test.beforeEach(async ({ request, context }) => {
  const token = createSession('e2e-only-session-secret-not-for-deployment', 'e2e-workspace-password');
  const cookies = [{ name: 'streakify_session', value: token, domain: '127.0.0.1', path: '/' }];
  await context.addCookies(cookies);
  // Seed through the authenticated API without spending the login limiter's attempts.
  const response = await request.post('/api/import', { data: newState('UTC'), headers: { Cookie: `streakify_session=${token}` } });
  expect(response.ok()).toBeTruthy();
});

test('private sign-in persists through reload and sign-out hides the workspace', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little better, every day.' })).toBeVisible();
  await page.getByLabel('Workspace password', { exact: true }).fill('e2e-workspace-password');
  await page.getByRole('button', { name: 'Open my workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Workspace password', { exact: true })).toBeVisible();
});

test('create a timed habit, log partial and full progress, persist, redeem and undo', async ({ page, request }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make today count.' })).toBeVisible();
  await page.getByRole('button', { name: 'Read a little 20 minutes a day' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Create habit', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Log Read a little', exact: true }).click();
  await page.getByRole('button', { name: '+5 minutes', exact: true }).click();
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(page.getByText('5 / 20 minutes', { exact: true })).toBeVisible();
  let state = await (await request.get('/api/state')).json();
  expect(state.entries[0].xp).toBe(0);
  await page.getByRole('button', { name: 'Log Read a little', exact: true }).click();
  await page.getByRole('button', { name: 'Complete goal', exact: true }).click();
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo Read a little', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('20 / 20 minutes', { exact: true })).toBeVisible();
  state = await (await request.get('/api/state')).json(); expect(state.entries[0].xp).toBe(20); expect(state.entries[0].coins).toBe(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-today.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'New reward', exact: true }).click();
  await page.getByLabel('Reward name', { exact: true }).fill('A good coffee');
  await page.getByLabel('Coin cost', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Create reward', exact: true }).click();
  await page.getByRole('button', { name: 'Redeem', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Refunded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /^Undo Read a little on/ }).click();
  await page.getByRole('button', { name: 'Undo check-in', exact: true }).click();
  state = await (await request.get('/api/state')).json();
  expect(state.entries).toHaveLength(0);
  expect(state.transactions.reduce((sum: number, t: { coins: number }) => sum + t.coins, 0)).toBe(0);
  expect(errors).toEqual([]);
});

test('customize, pause, archive, restore and validate backup import on narrow screens', async ({ page, request }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New habit', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Daily stretch');
  await page.getByRole('button', { name: 'Create habit', exact: true }).click();
  await page.getByRole('button', { name: 'My habits', exact: true }).click();
  await page.getByRole('button', { name: 'Pause Daily stretch', exact: true }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume Daily stretch', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Daily stretch', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Morning stretch');
  await page.getByRole('combobox', { name: 'Schedule', exact: true }).selectOption('weekdays');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText(/Rule changes start/)).toBeVisible();
  await page.getByRole('button', { name: 'Archive Morning stretch', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Archived 1' }).click();
  await page.getByRole('button', { name: 'Restore Morning stretch', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Rushi');
  await page.getByLabel('Timezone', { exact: true }).fill('Asia/Kolkata');
  await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const colors = await page.locator('html').evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(colors).toEqual({ color: 'rgb(232, 239, 233)', background: 'rgb(24, 35, 30)' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-settings.png`, fullPage: true });
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const backup = await (await request.get('/api/export')).json();
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
  await page.getByRole('button', { name: 'Replace and restore', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  expect((await (await request.get('/api/state')).json()).habits).toHaveLength(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Replace and restore', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Rushi');
});

test('daily filters, search, keyboard dialogs and narrow layouts remain usable', async ({ page, request }, testInfo) => {
  for (const [name, category, icon] of [['Read a little', 'Learning', 'book'], ['Morning stretch', 'Health', 'move']]) {
    const response = await request.post('/api/command', { data: { requestId: crypto.randomUUID(), command: { type: 'habit.save', input: { name, category, icon, color: 'green', rule: defaultRule } } } });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Log Read a little', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.habit-list .habit-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Undo Read a little', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'To do', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log Morning stretch', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search habits' }).fill('not a habit');
  await expect(page.getByRole('heading', { name: 'No matching habits' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all habits', exact: true }).click();
  await expect(page.locator('.habit-list .habit-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'New habit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New habit', exact: true })).toBeFocused();
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-dashboard.png`, fullPage: true });
});

test('database errors remain actionable when the workspace cannot load', async ({ page }) => {
  await page.route('**/api/state', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The database could not be reached. Check the server connection and try again.' }) }));
  await page.goto('/');
  await expect(page.getByText('The database could not be reached. Check the server connection and try again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('notes persist across reload, history editing, and backup restore', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New habit', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Morning walk');
  await page.getByRole('button', { name: 'Create habit', exact: true }).click();
  await page.getByRole('button', { name: 'Log Morning walk', exact: true }).click();
  await page.getByLabel('More options for Morning walk', { exact: true }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Check-in note', { exact: true }).fill('A walk before breakfast.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.reload();
  await expect(page.getByText('A walk before breakfast.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /^Edit note for Morning walk on/ }).click();
  await page.getByLabel('Check-in note', { exact: true }).fill('Fresh air helped.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByRole('button', { name: 'With notes only', exact: true }).click();
  await expect(page.getByText('Fresh air helped.', { exact: true })).toBeVisible();
  const backup = await (await request.get('/api/export')).json();
  expect(backup.entries[0].note).toBe('Fresh air helped.');
  expect((await request.post('/api/import', { data: backup })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText('Fresh air helped.', { exact: true })).toBeVisible();
  expect(backup.entries[0].xp).toBe(20);
});
