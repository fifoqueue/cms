import type { UserProfile } from '@cms/sdk';
import type { UserRecord } from '#api/domain/auth/ports';

/** The signed-in user's own profile; never the password hash. */
export const toProfile = (user: UserRecord): UserProfile => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role as UserProfile['role'],
  slug: user.slug,
  bio: user.bio,
  locale: user.locale as UserProfile['locale'],
});
