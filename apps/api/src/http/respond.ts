import type { ApiErrorBody } from '@cms/sdk';
import { DomainError } from '../shared/errors';
import type { ErrorCode } from '../shared/errors';
import type { Logger } from '../shared/logger';

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status });

export const noContent = () => new Response(null, { status: 204 });

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  issues?: unknown,
) =>
  Response.json({ error: { code, message, issues } } satisfies ApiErrorBody, {
    status,
  });

export const toErrorResponse = (error: unknown, logger: Logger) => {
  if (error instanceof DomainError)
    return errorResponse(
      STATUS[error.code],
      error.code,
      error.message,
      error.issues,
    );
  logger.error('Unhandled error', error);
  return errorResponse(500, 'internal', 'Internal server error');
};
