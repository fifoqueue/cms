import { can, capabilityCheckSchema } from '@cms/sdk';
import type { Capability, CapabilityObject } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { HookDispatcher } from '#api/domain/ports';
import type { CommentRepository } from '#api/domain/comments/ports';
import { forbidden } from '#api/shared/errors';

/** The core decision is an initial value; only the boolean is mutable. */
export const objectAllowed = (
  hooks: HookDispatcher | undefined,
  actor: Actor,
  capability: Capability,
  object: () => CapabilityObject,
  allowed = can(actor, capability),
): boolean | Promise<boolean> => {
  if (!hooks?.has('capability.check')) {
    return allowed;
  }

  const context = {
    userId: actor.id,
    role: actor.role,
    capability,
    object: object(),
  };
  const snapshot = JSON.stringify(context);

  return hooks
    .applyFilter('capability.check', { ...context, allowed }, (value) => {
      const result = capabilityCheckSchema.safeParse(value);

      if (!result.success) return false;

      const { allowed: _, ...next } = result.data;

      return JSON.stringify(next) === snapshot;
    })
    .then((result) => result.allowed);
};

export const authorizeObject = (
  hooks: HookDispatcher | undefined,
  actor: Actor,
  capability: Capability,
  object: () => CapabilityObject,
  allowed = can(actor, capability),
): void | Promise<void> => {
  const result = objectAllowed(hooks, actor, capability, object, allowed);
  const assert = (permitted: boolean) => {
    if (!permitted) throw forbidden();
  };

  if (typeof result === 'boolean') {
    assert(result);

    return;
  }

  return result.then(assert);
};

/** Validates every existing comment before batch writes; no handlers means no extra reads. */
export const authorizeComments = async (
  hooks: HookDispatcher,
  actor: Actor,
  repository: Pick<CommentRepository, 'findById'>,
  ids: readonly string[],
  capability: Capability = 'comments.moderate',
) => {
  if (!hooks.has('capability.check')) {
    if (!can(actor, capability)) throw forbidden();

    return;
  }

  for (const id of ids) {
    const record = await repository.findById(id);

    if (!record) continue;

    await authorizeObject(hooks, actor, capability, () => ({
      kind: 'comment',
      id: record.id,
      ...(record.userId ? { ownerId: record.userId } : {}),
      status: record.status,
    }));
  }
};
