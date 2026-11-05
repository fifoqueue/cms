import type { PermalinkSettings } from '@cms/sdk';

export interface PathOwner {
  contentId: string;
  /** False for a permanent redirect left by an earlier path. */
  current: boolean;
  /** Only this path's recorded public availability may disclose its removal. */
  gone?: boolean;
}

/** Stored ownership is byte-exact; request resolution has an explicit ASCII-case fallback. */
export interface PathLookup {
  /** Owner of the current path or redirect `path`, whatever the content's status. */
  findByPath(path: string): Promise<PathOwner | null>;
  /** ASCII-case fallback only; ambiguous spellings return null. Exact lookup always wins. */
  findCaseInsensitive(path: string): Promise<PathOwner | null>;
  /** A once-public path retained after permanent deletion. Live owners take precedence. */
  wasDeleted(path: string): Promise<boolean>;
}

/** Adds old addresses of imported content as permanent redirects. */
export interface RedirectWriter {
  /**
   * Records `path` as a redirect to `contentId`, serialized with path writes. False (nothing
   * written) when the path is not a valid unreserved content path, lies under an archive base or
   * is already someone's path or redirect.
   */
  addRedirect(contentId: string, path: string): Promise<boolean>;
}

export interface PermalinkRepository extends PathLookup {
  /** Stored templates through `readPermalinkSettings`; defaults when never saved. */
  readSettings(): Promise<PermalinkSettings>;
  /**
   * Moves content in collision-checked batches before publishing settings. Successful batches
   * may survive an interrupted call; submitting the same settings resumes from durable progress.
   * Old published paths remain redirects. Writers are refused during pending regeneration.
   * A different settings submission restarts the scan with the new target. Each failed batch
   * is atomic; already committed batches are not rolled back.
   */
  saveSettings(settings: PermalinkSettings): Promise<void>;
}
