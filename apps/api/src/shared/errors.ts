export type ErrorCode =
  'invalid_input' | 'unauthorized' | 'not_found' | 'conflict' | 'rate_limited';

/** An expected failure that maps to a client error. Anything else is a bug. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const invalidInput = (message: string, issues?: unknown) =>
  new DomainError('invalid_input', message, issues);
export const unauthorized = (message = 'Authentication required') =>
  new DomainError('unauthorized', message);
export const notFound = (subject: string) =>
  new DomainError('not_found', `${subject} not found`);
export const conflict = (message: string) =>
  new DomainError('conflict', message);
/** Too many attempts; the client may retry later. */
export const rateLimited = (message: string) =>
  new DomainError('rate_limited', message);

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
