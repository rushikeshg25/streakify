# Streakify

A responsive, configurable habit tracker with XP, levels, coins, and personal rewards. Built for a private, single-user workspace on **Vercel Hobby**, using **your PostgreSQL connection URI** for durable storage.

## Run locally

Requires Node.js 22.13 or newer in the Node 22 release line.

```sh
npm install
npm run dev
```

Open http://localhost:5173. If that port is occupied, use `PORT=5188 npm run dev`.

Without environment variables, local development uses `data/streakify.sqlite` and does not require a password. This mode binds to localhost. To use PostgreSQL locally, copy `.env.example` to `.env` and replace its placeholders. The server loads `.env` automatically. Do not commit it.

```sh
npm run build
npm start
```

The production build serves the same UI and API locally. Vercel uses the static build and API function directly; it does not run `npm start`.

## Deploy to Vercel

1. Push this project to your Git provider and import it into Vercel.
2. Select the **Vite** framework preset, build command **`npm run build`**, output directory **`dist`**, and Node.js **22.x**. These build defaults are also in `vercel.json`.
3. Add these **server-side** environment variables to the deployment:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Your standard `postgresql://…` URI. Prefer your provider's pooled endpoint for serverless workloads. Include the SSL parameters supplied by your provider. |
   | `APP_PASSWORD` | A private workspace password of at least 12 characters. |
   | `SESSION_SECRET` | A random secret of at least 32 characters. Generate one with `openssl rand -hex 32`. |

4. Deploy and open the site. Sign in with the workspace password.
5. In Settings, choose your timezone and week start **before your first check-in**.

The database user must be able to create tables in its default schema. The app initializes its `streakify_*` tables on the first authenticated database operation, including sign-in. Use a separate database or schema for this app. If your database restricts network access, it must allow connections from Vercel's execution environment.

Do not prefix these variables with `VITE_`; that would expose them to the browser. Production fails closed if login configuration or the database URI is missing. Password changes invalidate existing sessions. Preview deployments should use a separate database to avoid changing production habits.

The application uses static assets and **one Node API function**, with no cron jobs, persistent server, paid Vercel add-ons, or filesystem writes in deployed mode. Your database is supplied separately. Vercel Hobby is intended for personal, non-commercial use, and provider usage limits still apply. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).

No deployment or live database is created by this repository. Add your URI and environment variables in Vercel; a remote database connection cannot be verified until those are configured.

## What is included

- **Today:** Daily agenda, week navigation, backdated check-ins, partial counts/minutes, one-tap checkmarks, rest days, and undo.
- **My habits:** Templates, custom names/categories/icons/colors, daily/weekday/weekly schedules, ordering, pause/resume, archive/restore, and custom earnings.
- **Progress:** Calendar, eight-week completion chart, check-in history, current streaks, and historical undo.
- **Rewards:** Custom coin costs and descriptions, daily/weekly redemption limits, redemption history, and refunds.
- **Settings:** Name, timezone, week start, light/dark/system appearance, default XP/coins, XP per level, optional streak bonus, visibility controls, and JSON backup export/restore.
- **Private access:** Password sign-in, signed HttpOnly cookies, seven-day sessions, same-origin mutation checks, and login attempt limits. PostgreSQL persists the limit across function instances.

The app starts empty; templates are opt-in and no synthetic progress is added.

## Progress rules

- XP accumulates; coins can be spent. Rewards are personal promises, not external purchases.
- Checkbox habits have a target of one. Counts and durations earn only when their daily target is reached.
- Weekly habits require completion on a configurable number of distinct days; only those sessions earn rewards. Their streak counts successful weeks.
- Unscheduled weekdays do not break daily streaks. Explicit rest days and paused periods protect streaks without earning points. A partly paused weekly period still needs its target; a fully paused week is skipped.
- Name, category, icon, and color changes apply immediately. Rule changes start the following day, or the following week when either the old or new schedule is weekly. Additional edits replace the pending change.
- Check-ins snapshot their applicable rules and actual earnings. Changed defaults do not rewrite past earnings. Changing XP per level intentionally recalculates the displayed level.
- Week start is locked once check-ins exist, to preserve historical weekly boundaries. Changing timezone affects future date calculations; saved date labels remain unchanged.
- Duplicate request IDs are idempotent. Completion updates, earnings, redemptions, and request IDs are committed atomically.
- Undo reverses exactly the saved earnings. If those coins were already spent, a negative balance is allowed so history can be corrected. Earn more coins or return a reward to restore the balance.
- Game visibility switches hide indicators; they do not delete earnings. Set XP/coin defaults and overrides to zero to stop earning them.

## Data and backups

PostgreSQL stores the personal workspace as a versioned JSONB document, with separate request-deduplication and login-limit tables. A row lock serializes mutations across Vercel invocations. Connections are opened and closed within each request, so no background process or connection keeper is required. There is no polling or recurring database work while the page is idle.

The local SQLite adapter stores the same domain records in tables. Both adapters run the same validated commands. JSON export/import transfers data between local and hosted workspaces.

Use **Settings → Export backup** to download the complete workspace. Restore validates the structure, references, rule dates, and balances before replacing anything. Restoring is intentionally explicit and destructive; export first if you want to retain the old workspace. Backups are limited to 4 MB to stay below Vercel's request-size limit.

This aggregate design is sized for personal use. Multi-user accounts, public signup, offline synchronization, reminders, social features, and arbitrary scripts are not implemented. Very large histories would need paginated storage rather than sending the entire workspace. Database-level scheduled backups can be managed with your PostgreSQL provider.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

To use an existing Chrome executable:

```sh
CHROME_PATH=/path/to/chrome npm run test:e2e
```

Domain/API tests cover scheduling, timezone boundaries, reward accounting, duplicate commands, durable local storage, restore validation, and private access. Browser tests exercise full workflows at desktop and phone sizes, including a 320px layout check. They use a separate temporary SQLite database at `/tmp/streakify-e2e.sqlite`, never the application database.

## Code map

- `shared/model.ts`: validated data schemas, date arithmetic, schedules, and streak calculations.
- `shared/commands.ts`: habit, check-in, reward, and settings mutations; backup validation.
- `server/postgres.ts`: PostgreSQL persistence, locking, deduplication, and persistent login limits.
- `server/store.ts`: local SQLite adapter.
- `server/api.ts`, `server/auth.ts`: HTTP endpoints, validation, and private sessions.
- `api/[...path].ts`: Vercel function entry point.
- `src/`: responsive React UI, forms, screens, and styling.
