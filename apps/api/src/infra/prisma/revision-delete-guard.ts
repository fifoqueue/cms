import type { RevisionDeleteGuard } from '#api/domain/content/revisions';
import { conflict, notFound, Errors } from '#api/shared/errors';

/** Throws unless the locked entry still matches the snapshot the delete was authorized for. */
export const checkDeleteGuard = (
  current: RevisionDeleteGuard | null | undefined,
  guard: RevisionDeleteGuard,
) => {
  if (!current) throw notFound(Errors.ContentNotFound);
  if (
    current.updatedAt.getTime() !== guard.updatedAt.getTime() ||
    current.authorId !== guard.authorId ||
    current.status !== guard.status
  )
    throw conflict(Errors.ContentChanged);
};
