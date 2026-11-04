import { expect, test } from 'bun:test';
import { fieldDefinitionSchema } from '@cms/sdk';

// SvelteKit provides these at build time (same values as `page-data.test.ts`).
Bun.plugin({
  name: 'sveltekit-env',
  setup(build) {
    build.module('$app/env/private', () => ({
      exports: {
        CMS_API_URL: 'http://cms.test',
        API_PORT: '4000',
        CMS_FRONTEND_SECRET: '',
        OIDC_FRONTEND_SECRET: '',
      },
      loader: 'object',
    }));
    build.module('$app/paths', () => ({
      exports: { resolve: (path: string) => path, match: async () => null },
      loader: 'object',
    }));
  },
});

const { readTermForm } = await import('#lib/server/taxonomy-admin.js');

const definitions = [
  { key: 'rank', label: 'Rank', type: 'number', required: true },
  { key: 'featured', label: 'Featured', type: 'boolean' },
  { key: 'plugin:demo:cover', label: 'Cover', type: 'image' },
].map((field) =>
  fieldDefinitionSchema.parse({ ...field, taxonomies: ['category'] }),
);

const termForm = (entries: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
};

test('term forms send typed field values, required ones included, only when the taxonomy declares fields', () => {
  const filled = readTermForm(
    termForm({
      name: 'News',
      'field.rank': ' 3 ',
      'field.featured': 'on',
      'field.plugin:demo:cover': 'media-1',
      'field.undeclared': 'x',
    }),
    'category',
    'create',
    definitions,
  );
  expect(filled.input?.fields).toEqual({
    rank: 3,
    featured: true,
    'plugin:demo:cover': 'media-1',
  });

  // Empty inputs are omitted so the API reports the missing required field.
  const empty = readTermForm(
    termForm({ name: 'News', 'field.rank': '' }),
    'category',
    'update',
    definitions,
  );
  expect(empty.input?.fields).toEqual({ featured: false });

  // Without term fields nothing is sent and the API keeps the stored values.
  const plain = readTermForm(termForm({ name: 'Plain' }), 'tag', 'update');
  expect(plain.input).toBeDefined();
  expect(plain.input?.fields).toBeUndefined();
  expect(plain.values.fields).toBeUndefined();
});
