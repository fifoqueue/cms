import { readingSettingsSchema } from '@cms/sdk';
import type { Prisma } from '#api/infra/prisma/generated/client';
export const siteTimeZone = async (
  db: Pick<Prisma.TransactionClient, 'setting'>,
) => {
  const row = await db.setting.findUnique({ where: { key: 'reading' } });
  try {
    return readingSettingsSchema.parse(row ? JSON.parse(row.value) : {})
      .timeZone;
  } catch {
    return 'UTC';
  }
};
