import { z } from 'zod';
import {
  extensionKeySchema,
  profileFieldSchema,
  profileValuesSchema,
} from '@cms/sdk/plugin';
import type { ProfileField, ProfileValues } from '@cms/sdk/plugin';
import { parseInput } from '#api/shared/validation';

/** Declarations never execute plugin code. Namespaced private metadata is not a public DTO. */
export class ProfileFields {
  private readonly entries = new Map<
    object,
    { key: string; definition: z.output<typeof profileFieldSchema> }
  >();
  register(owner: string, key: string, input: ProfileField) {
    const name = `${parseInput(extensionKeySchema, owner)}:${parseInput(extensionKeySchema, key)}`;
    const definition = parseInput(profileFieldSchema, input);
    const token = {};
    this.entries.set(token, { key: name, definition });
    return () => {
      this.entries.delete(token);
    };
  }
  list() {
    const fields = new Map<
      string,
      { key: string; definition: z.output<typeof profileFieldSchema> }
    >();
    for (const field of this.entries.values())
      if (!fields.has(field.key)) fields.set(field.key, structuredClone(field));
    return [...fields.values()];
  }
  validate(input: unknown): ProfileValues {
    const shape: Record<string, z.ZodType> = {};
    for (const { key, definition } of this.list()) {
      let value: z.ZodType;
      if (definition.type === 'text')
        value = z.string().max(definition.maxLength);
      else if (definition.type === 'boolean') value = z.boolean();
      else {
        let number = z.number().finite();
        if (definition.min !== undefined) number = number.min(definition.min);
        if (definition.max !== undefined) number = number.max(definition.max);
        value = number;
      }
      shape[key] = value.optional();
    }
    return parseInput(
      profileValuesSchema,
      parseInput(z.strictObject(shape), input),
    );
  }
  visible(values: ProfileValues): ProfileValues {
    const result: ProfileValues = {};
    for (const { key } of this.list()) {
      if (!Object.hasOwn(values, key)) continue;
      try {
        Object.assign(result, this.validate({ [key]: values[key] }));
      } catch {
        /* Disabled or changed definitions never expose invalid stored values. */
      }
    }
    return result;
  }
}
