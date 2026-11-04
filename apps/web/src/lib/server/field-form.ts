import { FIELD_TYPES } from '@cms/sdk';
import type { FieldDefinitionInput, FieldType } from '@cms/sdk';
import { text } from '#lib/server/errors.js';

const values = (form: FormData, key: string) => [
  ...new Set(
    form
      .getAll(key)
      .filter((value): value is string => typeof value === 'string'),
  ),
];

/**
 * Reads the field definition form: its values with every target, the checked content types and
 * taxonomies (including undeclared ones the form lists) and the comment form.
 */
export const readFieldForm = (form: FormData): FieldDefinitionInput => {
  const type = text(form, 'type');

  return {
    key: text(form, 'key'),
    label: text(form, 'label'),
    type: (FIELD_TYPES as readonly string[]).includes(type)
      ? (type as FieldType)
      : 'text',
    options: text(form, 'options')
      .split('\n')
      .map((option) => option.trim())
      .filter(Boolean),
    required: form.has('required'),
    public: form.has('public'),
    help: text(form, 'help'),
    contentTypes: values(form, 'contentTypes'),
    taxonomies: values(form, 'taxonomies'),
    comments: form.has('comments'),
  };
};
