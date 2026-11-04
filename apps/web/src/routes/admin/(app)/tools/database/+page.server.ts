import { fail } from '@sveltejs/kit';
import {
  databaseCleanupCategorySchema,
  databaseCleanupInputSchema,
  databaseCleanupOptionsSchema,
} from '@cms/sdk';
import type { DatabaseCleanupCounts, DatabaseTableSize } from '@cms/sdk';
import { Errors, failFrom, issuesOf, text } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const categories = databaseCleanupCategorySchema.options;

const countsOf = (counts: DatabaseCleanupCounts) =>
  Object.fromEntries(
    categories.map((category) => [category, counts[category]]),
  ) as DatabaseCleanupCounts;

const tablesOf = (tables: readonly DatabaseTableSize[]) =>
  tables.map(({ table, dataBytes, indexBytes, freeBytes }) => ({
    table,
    dataBytes,
    indexBytes,
    freeBytes,
  }));

export const load: PageServerLoad = async (event) => {
  // A malformed `keepLatest` previews the default instead of failing the page.
  const options = databaseCleanupOptionsSchema.safeParse({
    keepLatest: Number(event.url.searchParams.get('keepLatest') ?? 0),
  });
  const preview = await adminFor(event).databaseCleanup.preview(
    options.success ? options.data : {},
  );

  return {
    counts: countsOf(preview.counts),
    tables: tablesOf(preview.tables),
    options: { keepLatest: preview.options.keepLatest },
  };
};

export const actions: Actions = {
  run: async (event) => {
    const form = await event.request.formData();
    const selected = form
      .getAll('category')
      .filter((value) => typeof value === 'string');

    if (selected.length === 0)
      return fail(400, { message: Errors.DatabaseCleanupNothingSelected });
    if (form.get('confirm') !== 'on')
      return fail(400, { message: Errors.DatabaseCleanupConfirmRequired });
    const input = databaseCleanupInputSchema.safeParse({
      categories: selected,
      options: { keepLatest: Number(text(form, 'keepLatest')) },
    });

    if (!input.success)
      return fail(400, {
        message: Errors.FormInvalid,
        code: 'invalid_input',
        issues: issuesOf(input.error.issues),
      } satisfies FormFailure);

    try {
      const result = await adminFor(event).databaseCleanup.run(input.data);

      return {
        notice: 'databaseCleanupDone',
        result: {
          categories: categories.filter((category) =>
            input.data.categories.includes(category),
          ),
          deleted: countsOf(result.deleted),
          optimization: result.optimization && {
            before: tablesOf(result.optimization.before),
            after: tablesOf(result.optimization.after),
          },
        },
      };
    } catch (caught) {
      return failFrom(caught);
    }
  },
};
