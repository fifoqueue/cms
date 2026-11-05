import { describe, expect, test } from 'bun:test';
import type { Database } from '#api/infra/prisma/client';
import type { Prisma } from '#api/infra/prisma/generated/client';
import { migrateLinkDefaults } from '#api/infra/prisma/link-defaults';
import { scratchDatabase } from '#test/support/scratch-database';

const serverUrl = process.env.CMS_TEST_DATABASE_URL;

const pattern = (text: string) =>
  JSON.stringify({
    document: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text,
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: '/a',
                    target: '_blank',
                    rel: 'noopener noreferrer nofollow',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    html: '',
  });

describe.skipIf(!serverUrl)('link default migration on MariaDB', () => {
  test('a case-only edit saved after the read is never overwritten', async () => {
    const { db, drop } = await scratchDatabase(
      serverUrl!,
      'cms_link_defaults_test',
    );

    try {
      const key = 'pattern.case';
      const edited = pattern('LINK');

      await db.setting.create({ data: { key, value: pattern('link') } });
      // The edit lands between the migration's read and its conditional write.
      const racing = new Proxy(db, {
        get: (target, property) => {
          if (property === 'setting')
            return {
              findMany: async (args: Prisma.SettingFindManyArgs) => {
                const rows = await target.setting.findMany(args);

                if (rows.length)
                  await target.setting.update({
                    where: { key },
                    data: { value: edited },
                  });

                return rows;
              },
            };
          const value: unknown = Reflect.get(target, property);

          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as Database;

      const report = await migrateLinkDefaults(racing, {
        dryRun: false,
        batch: 200,
      });

      expect(report).toMatchObject({
        patterns: 0,
        skipped: [`setting ${key}`],
      });
      expect(
        (await db.setting.findUniqueOrThrow({ where: { key } })).value,
      ).toBe(edited);
    } finally {
      await drop();
    }
  });
});
