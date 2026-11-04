import { z } from 'zod';

export const avatarUrlFilterSchema = z.strictObject({
  emailHash: z.string(),
  size: z.number().int().positive(),
  url: z.url({ protocol: /^https?$/ }),
});

export const avatarUrlSchema = z.union([
  z.string().startsWith('/avatars/'),
  avatarUrlFilterSchema.shape.url,
]);
