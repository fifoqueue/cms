import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import { readInstallationConfig } from '#api/infra/installation/config-store';

// The Prisma CLI does not read .env; load the optional shared one at the repository root.
// A path string, not a URL (Bun refuses URLs). Without a root .env the wizard's connection is used.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: (
      process.env.DATABASE_URL ??
      readInstallationConfig()?.DATABASE_URL ??
      'mysql://localhost:3306/cms'
    ).replace(/^mariadb:/, 'mysql:'),
  },
});
