import type { z } from 'zod';
import { issueParamsSchema } from '@cms/sdk';
import { invalidInput, Errors } from '#api/shared/errors';

/** Validates input crossing a trust boundary. Throws `invalid_input` with per-field issues. */
export const parseInput = <S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => {
    // Custom issues may name the values their catalog message leaves out.
    const params =
      issue.code === 'custom'
        ? issueParamsSchema.safeParse(issue.params).data
        : undefined;
    return {
      path: issue.path.map(String).join('.'),
      message: issue.message,
      ...(params && { params }),
    };
  });
  throw invalidInput(Errors.InvalidInput, issues);
};
