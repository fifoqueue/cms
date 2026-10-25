import { z } from 'zod';
import type { SignInContinuation, SignInRequest } from '@cms/sdk/plugin';
import type { UserProfile } from '@cms/sdk';
import type {
  CoreSignInMethod,
  CoreSignInOutcome,
} from '#api/domain/auth/core-sign-in';
import type { Clock, IdGenerator, RateLimiter } from '#api/domain/ports';
import type {
  ExternalIdentityRepository,
  VerifiedIdentity,
} from '#api/domain/auth/sso-ports';
import type { SignInTarget, SsoSetup } from '#api/domain/auth/sso-service';
import { storableIdentity } from '#api/domain/auth/sso-service';
import { sameIssuer } from '#api/domain/auth/sso-issuer';
import { DomainError, Errors, rateLimited } from '#api/shared/errors';

const pending = z.object({
  providerId: z.string().min(1).max(32),
  issuer: z.string().max(255),
  state: z.string().min(1).max(255),
  nonce: z.string().min(1).max(255),
  codeVerifier: z.string().min(1).max(255),
});

/** OIDC verifies identity; the engine alone applies sign-in policy, factors and session issuance. */
export const createSsoMethod = (deps: {
  setup(): Promise<SsoSetup>;
  identities: ExternalIdentityRepository;
  resolve(
    identity: VerifiedIdentity,
    subjects: ReadonlyMap<string, string>,
  ): Promise<SignInTarget | null>;
  ids: IdGenerator;
  clock: Clock;
  starts: RateLimiter;
}): CoreSignInMethod => {
  const begin = async (
    request: SignInRequest,
    user?: UserProfile,
  ): Promise<CoreSignInOutcome> => {
    if (
      !deps.starts.tryAcquire(
        user ? `user:${user.id}` : `client:${request.client ?? 'unverified'}`,
      )
    )
      throw rateLimited(Errors.SsoRateLimited);
    const provider = (await deps.setup()).providers.find(
      (entry) => entry.id === request.option,
    );
    if (!provider) return { kind: 'failed' };
    const authorization = await provider.provider.authorize();
    return {
      kind: 'redirect',
      url: authorization.url,
      state: {
        providerId: provider.id,
        issuer: provider.issuer,
        state: authorization.state,
        nonce: authorization.nonce,
        codeVerifier: authorization.codeVerifier,
      },
    };
  };
  const complete = async (
    step: SignInContinuation,
    user?: UserProfile,
  ): Promise<CoreSignInOutcome> => {
    const parsed = pending.safeParse(step.state);
    if (!parsed.success || step.query === null) return { kind: 'failed' };
    const state = parsed.data;
    const provider = (await deps.setup()).providers.find(
      (entry) => entry.id === state.providerId,
    );
    if (!provider || !sameIssuer(provider.issuer, state.issuer))
      return { kind: 'failed' };
    let identity: VerifiedIdentity;
    try {
      identity = await provider.provider.verify(step.query, {
        state: state.state,
        nonce: state.nonce,
        codeVerifier: state.codeVerifier,
      });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'unauthorized')
        return { kind: 'failed' };
      throw error;
    }
    if (
      !sameIssuer(identity.issuer, provider.issuer) ||
      !storableIdentity(identity.issuer) ||
      !storableIdentity(identity.subject)
    )
      return { kind: 'failed' };
    if (user) {
      if (provider.subjects.has(identity.subject)) return { kind: 'failed' };
      const link = {
        id: deps.ids.next(),
        userId: user.id,
        ...identity,
        createdAt: deps.clock.now(),
      };
      return {
        kind: 'user',
        userId: user.id,
        identityId: link.id,
        commitSetup: (tokenHash, now) =>
          deps.identities.claim(link, tokenHash, now),
      };
    }
    const target = await deps.resolve(identity, provider.subjects);
    return target
      ? { kind: 'user', userId: target.user.id, identityId: target.identityId }
      : { kind: 'failed' };
  };
  return {
    label: 'Single sign-on',
    ready: async () => (await deps.setup()).providers.length > 0,
    options: async () =>
      (await deps.setup()).providers.map(({ id, name }) => ({
        id,
        label: name,
      })),
    usableBy: async (user) => {
      const links = await deps.identities.findByUser(user.id);
      return (await deps.setup()).providers.some(
        (provider) =>
          links.some((identity) =>
            sameIssuer(identity.issuer, provider.issuer),
          ) ||
          [...provider.subjects.values()].includes(user.email.toLowerCase()),
      );
    },
    begin: (request) => begin(request),
    continue: (step) => complete(step),
    setup: {
      begin: (user, request) => begin(request, user),
      continue: (user, step) => complete(step, user),
    },
  };
};
