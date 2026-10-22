import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  CMS_API_URL: {
    description:
      'Origin of the CMS API (default http://127.0.0.1:<API_PORT>). Server-side only; the browser never talks to the API directly.',
    schema: (value) => (value ?? '').replace(/\/+$/, ''),
  },
  API_PORT: {
    description:
      'Port of the API on this machine, used when CMS_API_URL is not set.',
    schema: (value) => value || '4000',
  },
  CMS_FRONTEND_SECRET: {
    description:
      'Same value as the API setting. Lets the API count sign-ins, password resets, comments and single sign-on per visitor; server-side only.',
    schema: (value) => value ?? '',
  },
  OIDC_FRONTEND_SECRET: {
    description:
      'Older name of CMS_FRONTEND_SECRET, still accepted when that is not set.',
    schema: (value) => value ?? '',
  },
});
