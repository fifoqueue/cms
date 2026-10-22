// Pure role and capability helpers: no runtime schema dependencies, safe for browser bundles.
/** WordPress-style roles, most privileged first. */
export const ROLES = [
  'administrator',
  'editor',
  'author',
  'contributor',
  'subscriber',
] as const;

export type Role = string;

/**
 * What a user may do. Content capabilities distinguish the user's own entries from everyone
 * else's; "own" checks happen where the entry is known.
 */
export const CAPABILITIES = [
  /** Write own drafts and submit them for review. */
  'content.create',
  /** Publish, schedule and make private; edit and delete own published entries. */
  'content.publish',
  /** Edit, publish and delete entries of other users, and change authors. */
  'content.editOthers',
  'taxonomy.manage',
  'media.upload',
  /** Edit and delete media uploaded by others. */
  'media.manage',
  'comments.moderate',
  /** Themes, menus and widgets. */
  'appearance.manage',
  /** Content types and custom fields. */
  'fields.manage',
  'users.manage',
  /** Site, reading, discussion, SEO, permalinks, security, email and search settings. */
  'settings.manage',
  'plugins.manage',
  /** Import, export, webhooks and site health. */
  'tools.manage',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const contributor: readonly Capability[] = ['content.create'];
const author: readonly Capability[] = [
  ...contributor,
  'content.publish',
  'media.upload',
];
const editor: readonly Capability[] = [
  ...author,
  'content.editOthers',
  'taxonomy.manage',
  'media.manage',
  'comments.moderate',
];

export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> =
  {
    administrator: CAPABILITIES,
    editor,
    author,
    contributor,
    subscriber: [],
  };

/** Whether `role` grants `capability`. Unknown roles grant nothing. */
export const can = (
  subject: string | { role: string; capabilities?: readonly Capability[] },
  capability: Capability,
) => {
  const role = typeof subject === 'string' ? subject : subject.role;
  const grants = typeof subject === 'string' ? undefined : subject.capabilities;
  const builtin = Object.hasOwn(ROLE_CAPABILITIES, role)
    ? ROLE_CAPABILITIES[role]
    : undefined;
  return (grants ?? builtin)?.includes(capability) ?? false;
};
