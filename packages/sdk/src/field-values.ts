import { z } from 'zod';
import { isJsonValue } from '#sdk/common';
import { Errors } from '#sdk/errors';

/** Values of an entry's or a term's custom fields: plain JSON by key. */
export const fieldValuesSchema = z
  .record(z.string().max(136), z.unknown())
  .refine((values) => isJsonValue(values), Errors.FieldValuesInvalid);

export type FieldValues = Record<string, unknown>;
