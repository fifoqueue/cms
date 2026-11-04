import { test } from 'bun:test';
import { runServerSmoke } from '#web-test/functions-server-smoke.mjs';

test('built server boots delivered functions and serves a real page', async () => {
  await runServerSmoke();
}, 210000);
