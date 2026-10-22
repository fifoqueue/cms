import type { PermalinkSettings } from '@cms/sdk';

export interface PathOwner {
  contentId: string;
  /** False for a permanent redirect left by an earlier path. */
  current: boolean;
}

/** Exact path lookup: byte-equal, never case-, accent- or encoding-folded. */
export interface PathLookup {
  /** Owner of the current path or redirect `path`, whatever the content's status. */
  findByPath(path: string): Promise<PathOwner | null>;
}

export interface PermalinkRepository extends PathLookup {
  /** Stored templates through `readPermalinkSettings`; defaults when never saved. */
  readSettings(): Promise<PermalinkSettings>;
  /**
   * Stores `settings` and moves every content item to its `contentPath`, atomically and
   * serialized with content writes. Old paths of ever-published content (`publishedAt` set) stay
   * as redirects; others are released. An unchanged current path is kept even if now reserved. Throws `invalid_input`/`conflict` (`pathChanges`/`planPathChanges`) with nothing
   * changed: the previous settings and paths remain.
   */
  saveSettings(settings: PermalinkSettings): Promise<void>;
}
