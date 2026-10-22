// pm2 process file for the built CMS. No .env is needed: the setup wizard and the admin area
// configure the site. Build once, then start:
//
//   bun install
//   bun run --filter @cms/api db:generate
//   bun run --filter @cms/web build
//   pm2 start ecosystem.config.cjs
//
// Optional overrides (ports, addresses, …) go in the root .env; see .env.example.
module.exports = {
  apps: [
    {
      name: 'cms-api',
      cwd: './apps/api',
      script: 'bun',
      args: '--env-file=../../.env src/main.ts',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      autorestart: true,
    },
    {
      name: 'cms-web',
      cwd: './apps/web',
      // server.js starts build/ on WEB_PORT (default 3000) with a 64 MB upload limit.
      script: 'bun',
      args: '--no-env-file server.js',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      autorestart: true,
    },
  ],
};
