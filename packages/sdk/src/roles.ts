import { z } from 'zod';
import { CAPABILITIES } from '#sdk/capabilities';
import { roleSchema } from '#sdk/auth';

export const roleDefinitionSchema = z.object({
  key: roleSchema,
  name: z.string().trim().min(1).max(100),
  capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
});
export type RoleDefinition = z.output<typeof roleDefinitionSchema>;
export const membershipSchema = z.object({
  enabled: z.boolean().default(false),
});
export const registrationSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.email().max(191),
});
