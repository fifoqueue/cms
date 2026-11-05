import type { RoleDefinition } from '#sdk/roles';
import type { AdminSecuritySettings, ProtectedAction } from '#sdk/security';
import type { AdminUserSummary, UserSave, UserQuery } from '#sdk/users';
import type { Capability } from '#sdk/capabilities';
import type { PrivacyRequest, PrivacyExportData } from '#sdk/privacy';
import type { UserProfile, CapabilityObject } from '#sdk/auth';
import type { PublicAuthor } from '#sdk/content';

/** Committed administrative changes; credentials are never included. */
export interface UserActionHooks {
  'user.passwordResetRequested': { user: UserProfile };
  'user.passwordReset': { user: UserProfile };
  'user.passwordChanged': { user: UserProfile };
  'user.signedOut': {
    user: UserProfile;
    /** `provider`: the identity provider ended these sessions via back-channel logout. */
    scope: 'session' | 'other' | 'all' | 'provider';
    /** For `provider`, the affected user's own id; no local actor exists. */
    actorId: string;
  };
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
  'avatar.url': { emailHash: string; size: number; url: string };

  /**
   * The core baseline contains roles within the actor's capability ceiling.
   * Handlers may narrow or widen it as an explicit server-code policy decision.
   * Results contain only existing, unique role keys; actorId is immutable.
   * Non-administrators cannot assign the administrator role.
   */
  'role.assignable': { actorId: string; roles: string[] };

  'capability.check': {
    userId: string;
    role: string;
    capability: Capability;
    object: CapabilityObject;
    allowed: boolean;
  };
  'user.passwordResetAllowed': { user: UserProfile; allowed: boolean };
  'user.loginRedirect': {
    user: UserProfile;
    method: string;
    redirectTo: string;
  };
  'user.sessionLifetime': { user: UserProfile; ttlMs: number };
  'user.sessionAllowed': {
    user: UserProfile;
    kind: 'session' | 'apiToken';
    allowed: boolean;
  };
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
  /** Membership supplies the initial boolean; every handler may allow or refuse registration. */
  'user.registrationAllowed': {
    allowed: boolean;
    email: string | null;
    name: string | null;
  };
}
