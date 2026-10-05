import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { postgresConnectionString } from '../server/postgres-config';

test('Supabase connections validate the hostname and official CA without exposing credentials', () => {
  for (const host of ['db.project.supabase.co', 'aws-0-ap-northeast-1.pooler.supabase.com']) {
    const url = new URL(postgresConnectionString(`postgresql://test:password@${host}:6543/postgres?sslmode=require`));
    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    const certificate = new X509Certificate(readFileSync(url.searchParams.get('sslrootcert')!));
    assert.equal(certificate.ca, true);
    assert.equal(certificate.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
    assert.equal(url.username, 'test');
    assert.equal(url.password, 'password');
  }
  const explicit = new URL(postgresConnectionString('postgresql://test@db.project.supabase.co/postgres?sslrootcert=/custom/ca.crt&sslmode=require'));
  assert.equal(explicit.searchParams.get('sslrootcert'), '/custom/ca.crt');
  for (const host of ['localhost', 'postgres.example.com', 'db.project.supabase.co.example.com']) {
    const original = `postgresql://test@${host}/database?sslmode=require`;
    assert.equal(postgresConnectionString(original), original);
  }
});
