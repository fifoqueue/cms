// Directory events avoid Bun --watch's Windows atomic-replacement failure:
// imported files can accept direct writes/DELETE access but reject replacement.
// Usage: bun scripts/watch.mjs <source directories...> -- <bun arguments...>
import { spawn, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
if (separator < 1 || separator === args.length - 1) {
  throw new Error('Usage: watch.mjs <directories...> -- <bun arguments...>');
}
const watchers = [];
let child;
let stopping = false;
let pending = false;
let timer;
let deadline;

const forceStop = () => {
  if (!child) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'inherit',
    });
  } else {
    child.kill('SIGKILL');
  }
};

const stopChild = () => {
  if (!child || deadline) return;
  child.kill('SIGTERM');
  deadline = setTimeout(forceStop, 3000);
};

const start = () => {
  pending = false;
  child = spawn(process.execPath, args.slice(separator + 1), {
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(error);
    shutdown(1);
  });
  child.on('exit', () => {
    clearTimeout(deadline);
    deadline = undefined;
    child = undefined;
    if (stopping) process.exit(process.exitCode ?? 0);
    if (pending) start();
    // Keep watching after a syntax/startup error so the next edit can recover.
  });
};

const restart = () => {
  if (stopping) return;
  pending = true;
  if (child) stopChild();
  else start();
};

const shutdown = (code = 0, consoleInterrupt = false) => {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  if (!child) process.exit(code);
  // Like parallel.mjs, share the console and give children their Ctrl+C grace.
  if (consoleInterrupt) {
    if (!deadline) deadline = setTimeout(forceStop, 3000);
  } else stopChild();
};

process.on('SIGINT', () => shutdown(0, true));
process.on('SIGTERM', () => shutdown());
for (const directory of args.slice(0, separator)) {
  const watcher = watch(directory, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(restart, 150);
  });
  watcher.on('error', (error) => {
    console.error(error);
    shutdown(1);
  });
  watchers.push(watcher);
}
start();
