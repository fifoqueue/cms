import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  CMS_API_URL: {
    description:
      'Origin of the CMS API. Server-side only; the browser never talks to the API directly.',
    schema: (value) => (value || 'http://localhost:4000').replace(/\/+$/, ''),
  },
  OIDC_FRONTEND_SECRET: {
    description:
      'Same value as the API setting. Lets the API count single sign-on requests per visitor; server-side only.',
    schema: (value) => value ?? '',
  },
});
