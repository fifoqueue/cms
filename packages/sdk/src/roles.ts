import { z } from 'zod';
import { capabilitySchema } from '#sdk/capability-contracts';
import { roleSchema } from '#sdk/auth';

export const roleDefinitionSchema = z.object({
  key: roleSchema,
  source: z.string().min(1).max(191).optional(),
  name: z.string().trim().min(1).max(100),
  capabilities: z.array(capabilitySchema).max(1000),
});
export type RoleDefinition = z.output<typeof roleDefinitionSchema>;
/** Deleting a custom role: its users get `reassignTo` first. */
export const roleDeleteSchema = z.object({ reassignTo: roleSchema });
export type RoleDeleteInput = z.input<typeof roleDeleteSchema>;
export const membershipSchema = z.object({
  enabled: z.boolean().default(false),
});
export const registrationSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.email().max(191),
});
