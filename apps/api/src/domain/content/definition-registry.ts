import { z } from 'zod';

const keySchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Validated static declarations. Disposal only removes the live declaration. */
export class DefinitionRegistry<T extends { key: string }> {
  private readonly entries = new Map<string, T>();

  constructor(
    private readonly schema: z.ZodType<T>,
    builtins: readonly T[] = [],
  ) {
    for (const value of builtins) {
      const entry = schema.parse(value);
      this.entries.set(entry.key, entry);
    }
  }

  register(owner: string, key: string, definition: object) {
    const id = `plugin:${keySchema.parse(owner)}:${keySchema.parse(key)}`;
    const entry = this.schema.parse({ ...definition, key: id });
    this.entries.set(id, entry);
    return () => {
      if (this.entries.get(id) === entry) this.entries.delete(id);
    };
  }

  list(): T[] {
    return structuredClone([...this.entries.values()]);
  }
}
