import { writeFile } from 'node:fs/promises';

await writeFile(process.env.COMPILER_READY, String(process.pid));
await new Promise(() => setInterval(() => {}, 1000));
