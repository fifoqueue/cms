import type { Prisma } from '#api/infra/prisma/generated/client';

/** Caller holds the affected entry locks before touching comments or revisions. */
export const eraseContentOrigin = async (
  tx: Prisma.TransactionClient,
  userId: string,
) => {
  await tx.content.updateMany({
    where: { createdById: userId },
    data: { createdById: null, createdIp: null, createdUserAgent: null },
  });
  await tx.content.updateMany({
    where: { modifiedById: userId },
    data: { modifiedById: null, modifiedIp: null, modifiedUserAgent: null },
  });
  await tx.contentRevision.updateMany({
    where: { authorId: userId },
    data: { authorId: null, ip: null, userAgent: null },
  });
};
