import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise emitted JavaScript under plain Node, as Vercel does (without tsx).
const output = mkdtempSync(join(tmpdir(), 'streakify-server-check-'));
try {
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--project', 'tsconfig.server.json', '--noEmit', 'false', '--rootDir', '.', '--outDir', output], { stdio: 'inherit' });
  writeFileSync(join(output, 'package.json'), '{"type":"module"}');
  symlinkSync(resolve('node_modules'), join(output, 'node_modules'), 'dir');
  const moduleUrl = relative => JSON.stringify(pathToFileURL(join(output, relative)).href);
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { once } from 'node:events';
    await import(${moduleUrl('server/postgres.js')});
    await import(${moduleUrl('server/store.js')});
    const { default: app } = await import(${moduleUrl('api/[...path].js')});
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const auth = await fetch(base + '/api/auth');
      assert.equal(auth.status, 200);
      assert.deepEqual(await auth.json(), { required: true, authenticated: false });
      const state = await fetch(base + '/api/state');
      assert.equal(state.status, 401);
      console.log('Compiled Vercel entry point: auth responds, private state is protected.');
    } finally { server.close(); }
  `], {
    stdio: 'inherit',
    env: { ...process.env, APP_PASSWORD: 'smoke-test-password-only', SESSION_SECRET: 'smoke-test-session-secret-not-for-deployment', DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1/streakify', POSTGRES_URL: '' },
    timeout: 15000,
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
