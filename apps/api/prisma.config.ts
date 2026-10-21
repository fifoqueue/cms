import { defineConfig } from 'prisma/config';
import { readInstallationConfig } from './src/infra/installation/config-store';

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
