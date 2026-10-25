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
// Visitor addresses (rate limits, comment IPs) come from the reverse proxy's X-Forwarded-For.
// `XFF_DEPTH` counts trusted proxies from the right: 1 takes the entry the nearest proxy
// appended, which a client cannot forge. Raise it for chains (e.g. CDN → nginx). The server
// listens on 127.0.0.1 by default, so only the local proxy can supply the header; direct
// connections without it get their socket address instead of the adapter's error.
env.ADDRESS_HEADER ??= 'x-forwarded-for';
env.XFF_DEPTH ??= '1';
const addressHeader = env.ADDRESS_HEADER.toLowerCase();

// The promoted release (scripts/release.js), so a rebuild never changes files under a running server.
const { server } = await import(
  pathToFileURL(join(await activeRelease(), 'index.js')).href
);
server.prependListener('request', (request) => {
  request.headers[protocolHeader] ??= request.socket.encrypted
    ? 'https'
    : 'http';
  if (addressHeader && request.socket.remoteAddress)
    request.headers[addressHeader] ??= request.socket.remoteAddress;
});
