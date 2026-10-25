import type { EmailFailureReason, IssueParams } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import { DomainError, Errors, paramsOf } from '#api/shared/errors';

const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ETLS',
]);
const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ETIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'ECONNECTION',
  'ESOCKET',
  'EDNS',
  'ConnectionRefused',
  'ConnectionClosed',
  'ConnectionReset',
  'FailedToOpenSocket',
]);
/** SMTP: the server answered, but refused the sender, recipients or message. */
const REJECTED_CODES = new Set(['EENVELOPE', 'EMESSAGE', 'EPROTOCOL']);
const REASONS = new Set<string>([
  'auth',
  'timeout',
  'tls',
  'network',
  'rejected',
] satisfies EmailFailureReason[]);

export interface Failure {
  reason: EmailFailureReason;
  /** The HTTP status the remote side answered with. */
  status?: number;
}

/**
 * The category of an outbound failure, read only from the `name` and `code` of the error and
 * its causes, a numeric cause (an HTTP status) or a category cause set by our own code. Their
 * messages, which may quote the remote side or credentials, are never read.
 */
export const failureOf = (error: unknown): Failure | undefined => {
  let node = error;
  for (let depth = 0; depth < 4 && node != null; depth++) {
    if (typeof node === 'number')
      return {
        reason: node === 401 || node === 403 ? 'auth' : 'rejected',
        status: node,
      };
    if (typeof node === 'string')
      return REASONS.has(node)
        ? { reason: node as EmailFailureReason }
        : undefined;
    if (typeof node !== 'object') return undefined;
    const { name, code, cause } = node as {
      name?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    if (typeof name === 'string' && /time-?out|abort/i.test(name))
      return { reason: 'timeout' };
    if (typeof code === 'string') {
      if (TLS_CODES.has(code) || code.startsWith('ERR_TLS'))
        return { reason: 'tls' };
      if (TIMEOUT_CODES.has(code)) return { reason: 'timeout' };
      if (code === 'EAUTH') return { reason: 'auth' };
      if (NETWORK_CODES.has(code)) return { reason: 'network' };
      if (REJECTED_CODES.has(code)) return { reason: 'rejected' };
    }
    node = cause;
  }
  return undefined;
};

const CATALOG = new Set<string>(Object.values(SdkErrors));

/** The first SDK catalog message among the error and its causes. */
const catalogMessageOf = (error: unknown) => {
  let node = error;
  for (let depth = 0; depth < 4 && node instanceof Error; depth++) {
    if (CATALOG.has(node.message)) return node.message;
    node = node.cause;
  }
  return undefined;
};

/** A stored status message as readers may see it: catalog text, else `fallback`. */
export const catalogOr = (message: string, fallback: string) =>
  CATALOG.has(message) ? message : fallback;

/**
 * What a failed outbound call records for administrators, in catalog text only: a refusal's own
 * message and values, a connection category (timeout, TLS, network), `messages.status` with the
 * HTTP status, a catalog message the failure carries, or `messages.other`. The raw error belongs
 * in the server log.
 */
export const outboundFailure = (
  error: unknown,
  messages: { status: string; other: string },
): { message: string; params?: IssueParams } => {
  if (error instanceof DomainError) {
    const params = paramsOf(error);
    return { message: error.message, ...(params && { params }) };
  }
  const failure = failureOf(error);
  if (failure?.status !== undefined)
    return { message: messages.status, params: { status: failure.status } };
  if (failure?.reason === 'timeout') return { message: Errors.OutboundTimeout };
  if (failure?.reason === 'tls') return { message: Errors.OutboundTlsFailed };
  if (failure?.reason === 'network')
    return { message: Errors.OutboundNetworkFailed };
  return { message: catalogMessageOf(error) ?? messages.other };
};
