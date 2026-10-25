import type {
  MailValues,
  MediaStorageInput,
  MediaStorageSettings,
} from '@cms/sdk';
import { readPluginFields } from '#lib/admin/settings/plugin-fields.server.js';
import { pluginDrivers } from '#lib/admin/settings/storage-drivers.js';
import { text } from '#lib/server/errors.js';

/** What the storage form shows: the saved settings, or what was typed. Never a secret. */
export interface MediaStorageFormValues {
  driver: string;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    publicBaseUrl: string;
    forcePathStyle: boolean;
    prefix: string;
  };
  /** The chosen plugin driver's own non-secret values. */
  plugin: { id: string; values: MailValues } | null;
}

type Drivers = NonNullable<MediaStorageSettings['availableDrivers']>;

export const storageFormValues = (
  settings: MediaStorageSettings,
): MediaStorageFormValues => ({
  driver: settings.driver,
  s3: {
    endpoint: settings.s3?.endpoint ?? '',
    region: settings.s3?.region ?? '',
    bucket: settings.s3?.bucket ?? '',
    accessKeyId: settings.s3?.accessKeyId ?? '',
    publicBaseUrl: settings.s3?.publicBaseUrl ?? '',
    forcePathStyle: settings.s3?.forcePathStyle ?? false,
    prefix: settings.s3?.prefix ?? '',
  },
  plugin: settings.pluginSettings
    ? { id: settings.driver, values: settings.pluginSettings }
    : null,
});

/**
 * Reads the media storage form. S3 fields are named by their settings paths (`s3.bucket`), so
 * issues land next to their inputs; plugin fields by `pluginFieldName`. Every panel stays in the
 * form, but only the chosen driver's settings are sent: the API keeps the others as saved.
 *
 * An empty secret is left out, so the API keeps the saved one; a plugin secret whose removal
 * box is checked is sent as `''`. `values` never holds a secret; `input` adds them for the API.
 */
export const readMediaStorageForm = (form: FormData, drivers: Drivers = []) => {
  const driver = text(form, 'driver');
  const plugin = pluginDrivers(drivers).find(({ id }) => id === driver);
  const fields = plugin
    ? readPluginFields(form, plugin.id, plugin.fields)
    : null;
  const values: MediaStorageFormValues = {
    driver,
    s3: {
      endpoint: text(form, 's3.endpoint').trim(),
      region: text(form, 's3.region'),
      bucket: text(form, 's3.bucket'),
      accessKeyId: text(form, 's3.accessKeyId'),
      publicBaseUrl: text(form, 's3.publicBaseUrl').trim(),
      forcePathStyle: form.has('s3.forcePathStyle'),
      prefix: text(form, 's3.prefix'),
    },
    plugin: plugin && fields ? { id: plugin.id, values: fields.values } : null,
  };
  const { publicBaseUrl, ...s3 } = values.s3;
  const input: MediaStorageInput = {
    driver,
    s3:
      driver === 's3'
        ? {
            ...s3,
            ...(publicBaseUrl && { publicBaseUrl }),
            secretAccessKey: text(form, 's3.secretAccessKey') || undefined,
          }
        : null,
    ...(fields && { pluginSettings: { ...fields.values, ...fields.secrets } }),
  };
  return { values, input };
};
