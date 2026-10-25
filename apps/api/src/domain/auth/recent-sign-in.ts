import type { Actor } from '#api/domain/auth/authorization';
import type { SessionRepository, TokenIssuer } from '#api/domain/auth/ports';
import type { Clock } from '#api/domain/ports';
import { Errors } from '@cms/sdk/errors';
import { unauthorized } from '#api/shared/errors';

/** Credential additions require a live interactive session issued within ten minutes. */
export const requireRecentSignIn = async (
  deps: {
    sessions: Pick<SessionRepository, 'find'>;
    tokens: TokenIssuer;
    clock: Clock;
  },
  actor: Actor,
  token: string,
  message: string = Errors.RecentSignInRequired,
): Promise<void> => {
  if (token.startsWith('cms_pat_')) throw unauthorized(message);
  const session = await deps.sessions.find(deps.tokens.digest(token));
  const now = deps.clock.now();
  if (
    !session ||
    session.userId !== actor.id ||
    session.expiresAt <= now ||
    session.createdAt > now ||
    now.getTime() - session.createdAt.getTime() > 10 * 60 * 1000
  )
    throw unauthorized(message);
};
