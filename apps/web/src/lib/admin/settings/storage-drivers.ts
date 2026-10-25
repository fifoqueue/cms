import type { MediaStorageSettings } from '@cms/sdk';
import { errorMessage, type FormError } from '#lib/admin/form-errors.js';
import type { Messages } from '#lib/i18n/index.js';

type Drivers = NonNullable<MediaStorageSettings['availableDrivers']>;

/** The storage drivers the CMS itself provides; the screen names them from the catalog. */
export const CORE_STORAGE_DRIVERS = ['local', 's3'] as const;

/** Plugin storage drivers among those the API offers. */
export const pluginDrivers = (drivers: Drivers = []) =>
  drivers.filter(
    ({ id }) => !(CORE_STORAGE_DRIVERS as readonly string[]).includes(id),
  );

/** The issue path the API reports for a plugin driver's field. */
export const pluginIssuePath = (key: string) => `pluginSettings.${key}`;

const S3_PATHS = [
  's3.endpoint',
  's3.region',
  's3.bucket',
  's3.accessKeyId',
  's3.secretAccessKey',
  's3.publicBaseUrl',
  's3.prefix',
];

/**
 * Splits a refusal's issues: those of an S3 field or of the submitted plugin driver's fields
 * (by path, first message each) show under their inputs; the rest are listed with the refusal.
 */
export const splitStorageIssues = (
  issues: readonly { path: string; message: string }[],
  driver: string,
  drivers: Drivers = [],
) => {
  const plugin = pluginDrivers(drivers).find(({ id }) => id === driver);
  const paths = new Set([
    ...S3_PATHS,
    ...(plugin?.fields ?? []).map(({ key }) => pluginIssuePath(key)),
  ]);
  const fields: Partial<Record<string, string>> = {};
  const rest: { path: string; message: string }[] = [];
  for (const issue of issues)
    if (paths.has(issue.path)) fields[issue.path] ??= issue.message;
    // The leftover test file is named in the refusal itself (`storageFailureTitle`).
    else if (issue.path !== 'probe') rest.push(issue);
  return { fields, rest };
};

/**
 * The refusal's headline: a connection check that could not remove its test file names the
 * bucket and key of its `probe` issue (as plain text) so the admin can delete it.
 */
export const storageFailureTitle = (
  m: Messages,
  language: string,
  failure: FormError,
) => errorMessage(m, language, failure);
