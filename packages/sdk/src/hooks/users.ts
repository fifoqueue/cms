import type { RoleDefinition } from '#sdk/roles';
import type { AdminSecuritySettings, ProtectedAction } from '#sdk/security';
import type { AdminUserSummary, UserSave, UserQuery } from '#sdk/users';
import type { Capability } from '#sdk/capabilities';
import type { PrivacyRequest, PrivacyExportData } from '#sdk/privacy';
import type { UserProfile } from '#sdk/auth';
import type { PublicAuthor } from '#sdk/content';

/** Committed administrative changes; credentials are never included. */
export interface UserActionHooks {
  'user.created': AdminUserSummary;
  'user.updated': UserProfile;
  'user.roleChanged': { user: UserProfile; previousRole: string };
  'user.deleted': { user: UserProfile; reassignTo: string | null };
  'role.created': RoleDefinition;
  'role.updated': RoleDefinition;
  'role.deleted': { role: RoleDefinition; reassignTo: string };
  'security.updated': AdminSecuritySettings;
  'privacy.requested': PrivacyRequest;
  'privacy.exported': PrivacyRequest;
  'privacy.erased': PrivacyRequest;
  'protection.blocked': {
    action: ProtectedAction;
    reason: 'rate_limited' | 'captcha_required' | 'captcha_invalid';
    accountDigest: string | null;
    addressDigest: string | null;
  };
}

export interface UserFilterHooks {
  'user.beforeSave': UserSave;
  'user.query': UserQuery;
  /** Only a verified user's registered capabilities may change; identity is immutable. */
  'user.capabilities': {
    userId: string;
    role: string;
    capabilities: Capability[];
  };
  'privacy.exportData': PrivacyExportData;
  'user.public': PublicAuthor;
  /** Deny-only; neither disabled membership nor a prior denial can be overridden. */
  'user.registrationAllowed': boolean;
}
