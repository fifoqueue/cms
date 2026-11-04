import { expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('functions execute in Node-backed Vite development and production preview', async () => {
  const script = fileURLToPath(
    import.meta.resolve('#web-test/functions-vite.mjs'),
  );
  const cwd = fileURLToPath(new URL('../../../', import.meta.url));
  const result = await promisify(execFile)('node', [script], {
    cwd,
    env: { ...process.env, BUN_EXECUTABLE: process.execPath },
    windowsHide: true,
    timeout: 45000,
  });

  expect(result.stdout).toContain(
    'Node Vite development SSR activated web functions',
  );
  expect(result.stdout).toContain(
    'Node Vite production build and preview activated web functions',
  );
}, 50000);
