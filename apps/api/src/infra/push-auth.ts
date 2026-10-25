import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Constant-time comparison of a stored push subscription auth secret with a presented one;
 * digests make the lengths equal, so neither content nor length leaks through timing.
 */
export const sameAuth = (stored: string, given: string) =>
  timingSafeEqual(digest(stored), digest(given));
