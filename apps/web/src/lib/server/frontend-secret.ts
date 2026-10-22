import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CMS_FRONTEND_SECRET, OIDC_FRONTEND_SECRET } from '$app/env/private';
import type { AdminClient } from '@cms/sdk/client';

/** Kept beside the web server's working directory, like the API's `data/`. */
const FILE = resolve('data/frontend.secret');

const read = () => {
  try {
    return readFileSync(FILE, 'utf8').trim();
  } catch {
    return '';
  }
};

let secret = CMS_FRONTEND_SECRET || OIDC_FRONTEND_SECRET || read();

/** The secret proving visitors' addresses to the API; empty until paired. */
export const frontendSecret = () => secret;

/**
 * Asks the API for the secret with an administrator's session and keeps it, so per-visitor rate
 * limits work without configuration. A failure leaves visitors unproven until the next try.
 */
export const pairFrontend = async (admin: AdminClient) => {
  if (secret) return;
  const paired = await admin.frontendSecret().catch(() => null);
  if (!paired) return;
  secret = paired.secret;
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, `${secret}\n`, { mode: 0o600 });
  } catch {
    // Not persisted: the next administrator sign-in after a restart pairs again.
  }
};
