import { expect, test } from 'bun:test';
import { fieldDefinitionSchema } from '@cms/sdk';
import { readFieldForm } from '#lib/server/field-form.js';

test('saving a field definition form keeps every content type, taxonomy and comment target', () => {
  const field = fieldDefinitionSchema.parse({
    key: 'rank',
    label: 'Rank',
    type: 'select',
    options: ['A', 'B'],
    required: true,
    public: false,
    help: 'Pick one',
    contentTypes: ['post', 'plugin:shop:product'],
    taxonomies: ['category', 'plugin:shop:brand'],
    comments: true,
  });
  // What the edit form submits for it, its targets checked.
  const form = new FormData();
  for (const [name, value] of [
    ['original', field.key],
    ['key', field.key],
    ['label', field.label],
    ['type', field.type],
    ['options', field.options.join('\n')],
    ['required', 'on'],
    ['help', field.help],
    ...field.contentTypes.map((key) => ['contentTypes', key]),
    ...field.taxonomies.map((key) => ['taxonomies', key]),
    ['comments', 'on'],
  ])
    form.append(name!, value!);
  expect(fieldDefinitionSchema.parse(readFieldForm(form))).toEqual(field);

  // Unchecked targets are removed, not kept from the stored definition.
  const narrowed = new FormData();
  for (const [name, value] of [
    ['key', 'note'],
    ['label', 'Note'],
    ['type', 'text'],
    ['taxonomies', 'tag'],
  ])
    narrowed.append(name!, value!);
  expect(readFieldForm(narrowed)).toMatchObject({
    contentTypes: [],
    taxonomies: ['tag'],
    comments: false,
  });
});
