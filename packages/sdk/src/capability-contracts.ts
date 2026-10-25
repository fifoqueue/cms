import { z } from 'zod';
export const capabilitySchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9]*$/);
export const capabilityDefinitionSchema = z.strictObject({
  key: capabilitySchema,
  label: z.string().trim().min(1).max(100),
});
export type CapabilityDefinition = z.output<typeof capabilityDefinitionSchema>;
export const capabilityInfoSchema = capabilityDefinitionSchema.extend({
  source: z.string().min(1).max(191),
});
export type CapabilityInfo = z.output<typeof capabilityInfoSchema>;
export interface CapabilityRegistrar {
  register(definition: CapabilityDefinition): () => void;
}
