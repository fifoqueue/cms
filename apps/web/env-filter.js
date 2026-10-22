/** API-only values must not remain in the internet-facing web process. */
const API_ONLY = [
  'DATABASE_URL',
  'API_HOST',
  'PLUGINS_DIR',
  'SESSION_TTL_HOURS',
  'PLUGIN_TIMEOUT_MS',
  'MEDIA_DIR',
  'MEDIA_MAX_MB',
  'SCHEDULER_INTERVAL_MS',
  'CMS_SECRET_KEY',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_CLIENT_AUTH_METHOD',
  'OIDC_REDIRECT_URI',
  'OIDC_SCOPES',
  'OIDC_NAME',
  'OIDC_MAX_PENDING_REQUESTS',
  'OIDC_MAX_PENDING_PER_CLIENT',
  'OIDC_STARTS_PER_MINUTE',
  'OIDC_STARTS_PER_MINUTE_PER_CLIENT',
  'OIDC_ALLOWED_SUBJECTS',
];

export const removeApiSecrets = (env = process.env) => {
  for (const key of API_ONLY) delete env[key];
};
