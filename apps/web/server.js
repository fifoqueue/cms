import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { removeApiSecrets } from '#web-env';
import { activeRelease } from '#web-release';

// Load the optional shared overrides, then remove values only the API may hold.
// Bun takes a path string only (not a URL); only a missing file is ignored.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
removeApiSecrets();

// Uploads and WordPress imports need more than the adapter's 512 KB default.
const env = process.env;
env.BODY_SIZE_LIMIT ??= '64M';
env.PORT = env.WEB_PORT ?? env.PORT ?? '3000';
env.HOST = env.WEB_HOST ?? env.HOST ?? '127.0.0.1';
// adapter-node takes every request for https unless a header says otherwise, so plain http
// form posts failed its cross-site check (403). A reverse proxy sets X-Forwarded-Proto; direct
// connections get the scheme they actually used.
env.PROTOCOL_HEADER ??= 'x-forwarded-proto';
const protocolHeader = env.PROTOCOL_HEADER.toLowerCase();

// The promoted release (scripts/release.js), so a rebuild never changes files under a running server.
const { server } = await import(
  pathToFileURL(join(await activeRelease(), 'index.js')).href
);
server.prependListener('request', (request) => {
  request.headers[protocolHeader] ??= request.socket.encrypted
    ? 'https'
    : 'http';
});
