import type { PrivacyAction, PrivacyRequest } from '@cms/sdk';
export interface PrivacyRecord extends Omit<
  PrivacyRequest,
  'createdAt' | 'expiresAt' | 'confirmedAt' | 'completedAt'
> {
  tokenHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  completedAt: Date | null;
}
export const PERSONAL_SECTIONS = [
  'profile',
  'profileFields',
  'comments',
  'apiTokens',
  'identities',
  'recoveryCodes',
  'passkeys',
  'totp',
  'content',
  'media',
] as const;
export type PersonalSection = (typeof PERSONAL_SECTIONS)[number];
export interface PrivacyRepository {
  insert(request: PrivacyRecord): Promise<void>;
  get(id: string): Promise<PrivacyRecord | null>;
  list(
    action: PrivacyAction,
    page: number,
  ): Promise<{ items: PrivacyRecord[]; total: number }>;
  /** Atomically consumes the token hash; repeats and expired requests return false. */
  confirm(id: string, hash: string, now: Date): Promise<boolean>;
  /** Only explicitly allowed fields of this email's subject, in id order. */
  data(
    email: string,
    section: PersonalSection,
    after: string | null,
    limit: number,
  ): Promise<Record<string, unknown>[]>;
  complete(id: string, now: Date): Promise<void>;
  /** One transaction: confirmed request, subject anonymization, credentials and matching job redaction. */
  erase(id: string, passwordHash: string, now: Date): Promise<void>;
}
