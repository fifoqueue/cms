import type { AvatarDirectory } from '#api/domain/comments/avatar-service';
import type { Database } from '#api/infra/prisma/client';
import { PUBLIC_CONTENT } from '#api/infra/prisma/content-criteria';

/** Server-only email lookup for signed public avatar identifiers. */
export class PrismaAvatarDirectory implements AvatarDirectory {
  constructor(private readonly db: Database) {}

  async email(key: string) {
    if (key.startsWith('comment:')) {
      const comment = await this.db.comment.findFirst({
        where: {
          id: key.slice('comment:'.length),
          status: { in: ['approved', 'pending'] },
        },
        select: { authorEmail: true },
      });
      return comment?.authorEmail ?? null;
    }
    if (key.startsWith('author:')) {
      const author = await this.db.user.findFirst({
        where: {
          slug: key.slice('author:'.length),
          contents: { some: PUBLIC_CONTENT },
        },
        select: { email: true },
      });
      return author?.email ?? null;
    }
    return null;
  }
}
