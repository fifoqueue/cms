import type { AdminScreen, CapabilityObject } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';

export type AdminUiAccess = (
  actor: Actor,
  screen: AdminScreen,
  id: string,
  write: boolean,
) => Promise<CapabilityObject | null>;

export const screenListCapability = {
  content: 'content.create',
  media: 'media.upload',
  users: 'users.manage',
  comments: 'comments.moderate',
  terms: 'content.create',
} as const;
