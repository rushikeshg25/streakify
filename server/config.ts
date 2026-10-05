export function databaseConnection(env: { DATABASE_URL?: string; POSTGRES_URL?: string }): string | undefined {
  return env.DATABASE_URL || env.POSTGRES_URL || undefined;
}

type Configuration = { hosted: boolean; password?: string; secret?: string; databaseUrl?: string; hasStore?: boolean };

export function configurationError({ hosted, password, secret, databaseUrl, hasStore }: Configuration): string | undefined {
  if ((hosted || password) && (!password || password.length < 12 || !secret || secret.length < 32)) {
    return 'Private workspace setup is incomplete. Set APP_PASSWORD (at least 12 characters) and SESSION_SECRET (at least 32 characters) in your server environment.';
  }
  if (hosted && !hasStore && !databaseUrl) return 'DATABASE_URL is missing. Add your PostgreSQL connection in Vercel settings, then redeploy.';
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
    } catch { return 'DATABASE_URL must be a valid PostgreSQL connection URI with a hostname and database name.'; }
  }
}
