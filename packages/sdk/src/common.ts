import { z } from 'zod';
import { Errors } from '#sdk/errors';

export type Awaitable<T> = T | Promise<T>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Highest accepted offset-pagination page. Larger values are resource-exhaustion input. */
export const PAGINATION_MAX_PAGE = 10_000;

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    issues?: unknown;
  };
}

/** Only display-safe validation details may cross the API-to-page-data boundary. */
export const formIssuesSchema = z.array(
  z.object({ path: z.string(), message: z.string() }),
);

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: formIssuesSchema.optional().catch(undefined),
  }),
});

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Own values of a plain array or object, read from property descriptors so no getter runs.
 * `undefined` when `JSON.stringify` would see anything but plain data: another prototype
 * (Date, Map, classes), accessors, non-enumerable (e.g. a hidden `toJSON`) or symbol keys,
 * array holes or named array keys.
 */
const plainChildren = (node: object): unknown[] | undefined => {
  const prototype: unknown = Object.getPrototypeOf(node);
  const isArray = Array.isArray(node);

  if (
    isArray
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  )
    return undefined;

  const children: unknown[] = [];

  for (const key of Reflect.ownKeys(node)) {
    if (isArray && key === 'length') continue;

    const descriptor = Object.getOwnPropertyDescriptor(node, key);

    if (
      typeof key === 'symbol' ||
      (isArray && key !== String(children.length)) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      return undefined;

    children.push(descriptor.value);
  }

  return isArray && children.length !== (node as unknown[]).length
    ? undefined
    : children;
};

/** Iterative, so cyclic or deep values cannot overflow the stack here. */
const hasJsonShape = (value: unknown): boolean => {
  const ancestors = new Set<object>();
  const stack: { node: unknown; leave: boolean }[] = [
    { node: value, leave: false },
  ];

  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node, leave } = frame;

    if (leave) {
      ancestors.delete(node as object);
      continue;
    }

    if (
      node === null ||
      typeof node === 'string' ||
      typeof node === 'boolean' ||
      (typeof node === 'number' && Number.isFinite(node))
    )
      continue;

    if (typeof node !== 'object' || ancestors.has(node)) return false;

    const children = plainChildren(node);

    if (!children) return false;

    ancestors.add(node);
    stack.push({ node, leave: true });

    for (const child of children) stack.push({ node: child, leave: false });
  }

  return true;
};

/**
 * The JSON text of `value` if it is plain JSON data that `JSON.stringify` can actually
 * serialize (the engine's nesting limit included), otherwise `undefined`. Never throws.
 */
const serialize = (value: unknown): string | undefined => {
  try {
    return hasJsonShape(value) ? JSON.stringify(value) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether `value` is plain JSON data that serializes and round-trips unchanged: null,
 * booleans, strings, finite numbers, and dense arrays / plain objects of those with only
 * enumerable data properties. Rejects undefined, functions, symbols, bigints, NaN/±Infinity,
 * class instances (Date, Map …), accessors, `toJSON` hooks, cycles and data nested deeper
 * than `JSON.stringify` supports. Never throws.
 */
export const isJsonValue = (value: unknown): value is JsonValue =>
  serialize(value) !== undefined;

/** `JSON.stringify` for values that pass `isJsonValue`; throws `TypeError` otherwise instead of changing data. */
export const stringifyJson = (value: unknown): string => {
  const json = serialize(value);

  if (json === undefined) throw new TypeError(Errors.NotJsonSerializable);

  return json;
};

export { CONTENT_SLUG } from '#sdk/slugs';

/** Lowercase ASCII words joined by single dashes, for system identifiers. */
export const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
