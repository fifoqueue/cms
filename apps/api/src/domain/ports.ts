import type {
  ActionHookMap,
  ActionName,
  FilterHookMap,
  FilterName,
} from '@cms/sdk/plugin';

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  now(): Date;
}

/**
 * Admits or refuses one attempt for `key` now, counting it against both the key's rate and the
 * overall rate. Synchronous, so the check and the reservation cannot interleave. A refused
 * attempt costs nothing and reserves nothing.
 */
export interface RateLimiter {
  tryAcquire(key: string): boolean;
}

/**
 * Encrypts secrets kept in the database (captcha, mail and search credentials). `open` returns
 * null when the value cannot be decrypted, for example after the key changed.
 */
export interface SecretBox {
  seal(plain: string): string;
  open(sealed: string): string | null;
}

/** Signs short values (preview links, unlock proofs) so they cannot be forged. */
export interface Signer {
  sign(value: string): string;
  /** Constant-time comparison. */
  verify(value: string, signature: string): boolean;
}

/** How core announces events and lets extensions transform values, without knowing who listens. */
export interface HookDispatcher {
  /** Runs action handlers. Never rejects, so callers may fire and forget. */
  emit<K extends ActionName>(name: K, payload: ActionHookMap[K]): Promise<void>;
  /** Runs filters in order. A filter result is used only if `accept` approves it. */
  applyFilter<K extends FilterName>(
    name: K,
    value: FilterHookMap[K],
    accept: (value: unknown) => boolean,
    /** Core observer of validated snapshots; used for owner-attributed capability audit. */
    accepted?: (
      owner: string,
      previous: FilterHookMap[K],
      next: FilterHookMap[K],
    ) => void,
  ): Promise<FilterHookMap[K]>;
}
