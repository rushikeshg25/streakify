import { fileURLToPath } from 'node:url';

export function postgresConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const supabase = url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com');
  if (!supabase) return connectionString;
  // Verify both the certificate chain and hostname. pg's sslmode parsing otherwise
  // replaces an ssl object supplied alongside the connection string.
  url.searchParams.set('sslmode', 'verify-full');
  if (!url.searchParams.has('sslrootcert')) {
    url.searchParams.set('sslrootcert', fileURLToPath(new URL('./certs/supabase-ca.crt', import.meta.url)));
  }
  return url.toString();
}
