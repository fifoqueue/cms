import { can } from '@cms/sdk';
import type { Capability } from '@cms/sdk';
import { forbidden } from '#api/shared/errors';

/** Who performs a use case. Only the role decides capabilities; ownership is checked per entry. */
export interface Actor {
  id: string;
  role: string;
  capabilities?: readonly Capability[];
}

/** Throws `forbidden` unless the actor's role grants `capability`. */
export const authorize = (actor: Actor, capability: Capability) => {
  if (!can(actor, capability)) throw forbidden();
};
