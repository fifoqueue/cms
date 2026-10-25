// Runs package scripts side by side with prefixed output: `bun scripts/parallel.mjs a b`.
// Replaces `bun run --parallel` / `bun --filter`, which on Windows give every child its own
// console, so Ctrl+C in the terminal never reaches the dev servers. Here the children share
// this console: Ctrl+C stops each of them, and this runner exits once they have.
import { spawn, spawnSync } from 'node:child_process';

const names = process.argv.slice(2);
const width = Math.max(...names.map((name) => name.length));
const running = new Map();
let interrupted = false;
let exitCode = 0;

const stopOthers = () => {
  for (const child of running.values()) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    else child.kill('SIGTERM');
  }
};

// The console delivers Ctrl+C to the children too; wait for them to finish, then stop the
// ones that ignore it (`prisma generate --watch` keeps running on Windows).
process.on('SIGINT', () => {
  if (interrupted) return;
  interrupted = true;
  setTimeout(stopOthers, 3000);
});
process.on('SIGTERM', stopOthers);

const pipe = (from, to, label) => {
  let rest = '';
  from.setEncoding('utf8');
  from.on('data', (chunk) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop() ?? '';
    for (const line of lines) to.write(`${label}${line}\n`);
  });
  from.on('end', () => rest && to.write(`${label}${rest}\n`));
};

for (const name of names) {
  const child = spawn(process.execPath, ['run', name], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  });
  const label = `${name.padEnd(width)} | `;
  pipe(child.stdout, process.stdout, label);
  pipe(child.stderr, process.stderr, label);
  running.set(name, child);
  child.on('exit', (code, signal) => {
    running.delete(name);
    // One server stopping on its own leaves the rest useless; stop them as well.
    if (!interrupted && running.size) {
      exitCode = code || 1;
      process.stderr.write(
        `${label}exited (${signal ?? code}); stopping the others\n`,
      );
      stopOthers();
    }
    if (!running.size) process.exit(interrupted ? 0 : exitCode || code || 0);
  });
}
