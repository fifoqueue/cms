import { API_TOKEN_PREFIX, apiTokenCreateSchema } from '@cms/sdk';
import type { ApiTokenCreated, ApiTokenDto } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { TokenIssuer, UserRecord } from '#api/domain/auth/ports';
import type { Clock, IdGenerator } from '#api/domain/ports';
import { notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface ApiTokenRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface ApiTokenRepository {
  insert(token: ApiTokenRecord & { tokenHash: string }): Promise<void>;
  /** The user's tokens, newest first. */
  list(userId: string): Promise<ApiTokenRecord[]>;
  /** False when the user has no such token. */
  delete(id: string, userId: string): Promise<boolean>;
  /** The token's id and user when valid; implementations also rate-limit last-used writes. */
  authenticate(
    tokenHash: string,
    now: Date,
  ): Promise<{ id: string; user: UserRecord } | null>;
}

const DAY = 24 * 60 * 60 * 1000;

const toDto = (token: ApiTokenRecord): ApiTokenDto => ({
  id: token.id,
  name: token.name,
  createdAt: token.createdAt.toISOString(),
  lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
  expiresAt: token.expiresAt?.toISOString() ?? null,
});

/** Application passwords: long-lived bearer tokens that act as their user, for integrations. */
export class ApiTokenService {
  constructor(
    private readonly deps: {
      tokens: ApiTokenRepository;
      issuer: TokenIssuer;
      ids: IdGenerator;
      clock: Clock;
    },
  ) {}

  async list(actor: Actor): Promise<ApiTokenDto[]> {
    return (await this.deps.tokens.list(actor.id)).map(toDto);
  }

  async create(input: unknown, actor: Actor): Promise<ApiTokenCreated> {
    const { name, expiresInDays } = parseInput(apiTokenCreateSchema, input);
    const now = this.deps.clock.now();
    const token = `${API_TOKEN_PREFIX}${this.deps.issuer.issue()}`;
    const record: ApiTokenRecord = {
      id: this.deps.ids.next(),
      userId: actor.id,
      name,
      createdAt: now,
      lastUsedAt: null,
      expiresAt: expiresInDays
        ? new Date(now.getTime() + expiresInDays * DAY)
        : null,
    };
    await this.deps.tokens.insert({
      ...record,
      tokenHash: this.deps.issuer.digest(token),
    });
    return { ...toDto(record), token };
  }

  async revoke(id: string, actor: Actor): Promise<void> {
    if (!(await this.deps.tokens.delete(id, actor.id)))
      throw notFound(Errors.ApiTokenNotFound);
  }

  /** The token's user, or null. Only tokens with the API token prefix are looked up. */
  async authenticate(token: string): Promise<UserRecord | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const now = this.deps.clock.now();
    const found = await this.deps.tokens.authenticate(
      this.deps.issuer.digest(token),
      now,
    );
    if (!found) return null;
    return found.user;
  }
}
