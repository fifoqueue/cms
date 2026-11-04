import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';

await import(pathToFileURL(join(process.cwd(), 'server.js')).href);
const { server } = await import(
  pathToFileURL(join(process.cwd(), 'build/index.js')).href
);

if (!server.listening)
  await once(server, 'listening', { signal: AbortSignal.timeout(10000) });
process.send({ port: server.address().port });
