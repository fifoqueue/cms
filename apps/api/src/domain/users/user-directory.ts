import type { RoleDefinition } from '@cms/sdk';
import type { UserRecord } from '#api/domain/auth/ports';

/** A user as administrators list them: never the password hash. */
export interface UserListItem extends Omit<UserRecord, 'passwordHash'> {
  /** Entries authored by the user, in every status. */
  contentCount: number;
}

export type UserChanges = Omit<UserRecord, 'passwordHash' | 'createdAt'>;
export type UserProfileChanges = Omit<UserChanges, 'role'>;

/** Role definitions and assignments sharing the same write lock. */
export interface RoleWriter {
  saveRole(role: RoleDefinition): Promise<void>;
  removeRole(key: string, reassignTo: string): Promise<void>;
}

/**
 * User administration. Writes are serialized with each other, so the "at least one administrator"
 * rule holds under concurrent requests.
 */
export interface UserDirectory {
  /** Newest first. */
  list(): Promise<UserListItem[]>;
  get(id: string): Promise<UserListItem | null>;
  /** A user with at least one public entry, by slug; null otherwise. */
  publicAuthor(
    slug: string,
  ): Promise<{ name: string; slug: string; bio: string } | null>;
  /** Inserts a user only while their role still exists. */
  insert(user: UserRecord): Promise<void>;
  /**
   * Replaces the profile and role. Throws `conflict` when the email or slug is taken, or when
   * the change would leave no administrator.
   */
  update(changes: UserChanges): Promise<void>;
  /** Replaces profile fields only; a concurrent role change is never replayed. */
  updateProfile(changes: UserProfileChanges): Promise<void>;
  /**
   * Changes only the role, keeping every profile field as currently stored. Throws `conflict`
   * when it would leave no administrator; checked under the same lock as `update`.
   */
  setRole(id: string, role: string): Promise<void>;
  /**
   * Deletes the user with their sessions and sign-in links. Their content moves to `reassignTo`
   * or is deleted with them. Throws `conflict` when no administrator would remain.
   */
  delete(id: string, reassignTo: string | null): Promise<void>;
}
