import type { AdminUiAccess } from '#api/plugin-runtime/admin-ui-access';
import { screenListCapability } from '#api/plugin-runtime/admin-ui-access';
import type { createRepositories } from '#api/composition/repositories';
import type { ContentService } from '#api/domain/content/content-service';
import type { MediaService } from '#api/domain/media/media-service';
import type { HookDispatcher } from '#api/domain/ports';
import { authorize } from '#api/domain/auth/authorization';
import { authorizeObject } from '#api/domain/auth/object-authorization';
import { DomainError } from '#api/shared/errors';

export const createAdminUiAccess =
  (
    repositories: Pick<
      Awaited<ReturnType<typeof createRepositories>>,
      'directory' | 'taxonomyRepository' | 'commentRepository'
    >,
    content: Pick<ContentService, 'get'>,
    media: Pick<MediaService, 'get' | 'editable'>,
    hooks: HookDispatcher,
  ): AdminUiAccess =>
  async (actor, screen, id, write) => {
    try {
      const capability =
        screen === 'terms' && write
          ? 'taxonomy.manage'
          : screenListCapability[screen];

      authorize(actor, capability);

      if (screen === 'content') {
        const entry = await content.get(id, actor);

        return {
          kind: 'content',
          id,
          ownerId: entry.authorId,
          status: entry.status,
        };
      }

      if (screen === 'media') {
        const entry = write
          ? await media.editable(id, actor)
          : await media.get(id, actor);

        return {
          kind: 'media',
          id,
          ...(entry.uploaderId ? { ownerId: entry.uploaderId } : {}),
        };
      }

      const object =
        screen === 'users'
          ? (await repositories.directory.get(id)) && {
              kind: 'user' as const,
              id,
            }
          : screen === 'terms'
            ? (await repositories.taxonomyRepository.findById(id, 'all')) && {
                kind: 'term' as const,
                id,
              }
            : await repositories.commentRepository.findById(id).then(
                (entry) =>
                  entry && {
                    kind: 'comment' as const,
                    id,
                    status: entry.status,
                    ...(entry.userId ? { ownerId: entry.userId } : {}),
                  },
              );

      if (!object) return null;
      await authorizeObject(hooks, actor, capability, () => object);

      return object;
    } catch (error) {
      if (error instanceof DomainError) return null;

      throw error;
    }
  };
