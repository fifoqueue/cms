import type { z } from 'zod';
import { invalidInput } from './errors';

/** Validates input crossing a trust boundary. Throws `invalid_input` with per-field issues. */
export const parseInput = <S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map(({ path, message }) => ({
    path: path.map(String).join('.'),
    message,
  }));
  throw invalidInput('Invalid input', issues);
};
