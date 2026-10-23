// Browser copies of the editor's text, so an expired session, a crash or a reload loses nothing.
// They live in sessionStorage (this tab only), belong to one account and one entry, and expire.

const PREFIX = 'cms-editor:';
const OWNER = 'cms-editor-owner';
/** Backups older than this are dropped unread. */
const LIFETIME_MS = 24 * 60 * 60 * 1000;

const session = (): Storage | null => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

/** Removes every editor backup in this tab (signing out, or another account signed in). */
export const clearBackups = (storage = session()) => {
  try {
    if (!storage) return;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    storage.removeItem(OWNER);
  } catch {
    // Blocked storage holds no backups.
  }
};

/** Drops another account's backups before the signed-in account can see them. */
export const claimBackups = (userId: string, storage = session()) => {
  try {
    if (!storage || storage.getItem(OWNER) === userId) return;
    clearBackups(storage);
    storage.setItem(OWNER, userId);
  } catch {
    // Blocked storage holds no backups.
  }
};

/** The backup of one entry (or new entry of a type) for one account. */
export const editorBackup = (
  userId: string,
  entry: string,
  storage = session(),
) => {
  const key = `${PREFIX}${userId}:${entry}`;
  const remove = () => {
    try {
      storage?.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  };
  return {
    read: (): string | null => {
      try {
        claimBackups(userId, storage);
        const raw = storage?.getItem(key);
        if (!raw) return null;
        const { owner, at, text } = JSON.parse(raw) as Record<string, unknown>;
        if (
          owner === userId &&
          typeof at === 'number' &&
          Date.now() - at < LIFETIME_MS &&
          typeof text === 'string'
        )
          return text;
      } catch {
        // An unreadable backup is dropped.
      }
      remove();
      return null;
    },
    write: (text: string) => {
      try {
        // A form left over from another account never writes into this tab again.
        if (storage?.getItem(OWNER) !== userId) return;
        storage.setItem(
          key,
          JSON.stringify({ owner: userId, at: Date.now(), text }),
        );
      } catch {
        // Full or blocked storage: the editor still holds the text.
      }
    },
    remove,
  };
};
