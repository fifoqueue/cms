import type { PermalinkSettings } from '@cms/sdk';
import {
  permalinkPatternFor,
  canonicalPermalinkPath,
  PERMALINK_TOKENS,
} from '@cms/sdk';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
import { contentPath } from '#api/domain/permalinks/content-path';
import type { PermalinkSubject } from '#api/domain/permalinks/content-path';
import { conflict, Errors, withParams } from '#api/shared/errors';

/** A stored path: the content's current path or one of its permanent redirects. */
export interface StoredPath {
  path: string;
  contentId: string;
  current: boolean;
}

/** One content item's current path, and whether that path stays as a redirect if it changes. */
export interface PathEntry {
  subject: PermalinkSubject;
  /** Stored current path; `null` for new content. */
  current: string | null;
  /** True when the content was ever published (`publishedAt` set), so links to `current` must keep working. */
  retainPrevious: boolean;
}

export interface PathChange {
  contentId: string;
  from: string | null;
  to: string;
  retainPrevious: boolean;
}

/** Statements in execution order; each list touches distinct paths. */
export interface PathPlan {
  /** Previous current paths dropped because they were never public. */
  release: string[];
  /** Previous current paths kept as redirects. */
  demote: string[];
  /** The content's own redirects that become its current path again. */
  promote: { path: string; contentId: string }[];
  insert: { path: string; contentId: string }[];
}

/** Regeneration keeps the old path of content that was ever published, unpublished included. */
export const regenerationEntry = (
  subject: PermalinkSubject,
  current: string | null,
): PathEntry => ({
  subject,
  current,
  retainPrevious: subject.publishedAt !== null,
});

/**
 * The entries whose path changes under `settings`; an entry missing here keeps its `current`.
 * Throws `invalid_input` like `contentPath`.
 */
export const pathChanges = (
  settings: PermalinkSettings,
  entries: Iterable<PathEntry>,
  timeZone = 'UTC',
  expanded?: ReadonlyMap<string, string>,
): PathChange[] => {
  const changes: PathChange[] = [];

  for (const { subject, current, retainPrevious } of entries) {
    const to = contentPath(
      settings,
      { ...subject, timeZone },
      current,
      expanded?.get(subject.id),
    );

    if (to !== current)
      changes.push({
        contentId: subject.id,
        from: current,
        to,
        retainPrevious,
      });
  }

  return changes;
};

export const resolvePathChanges = async (
  settings: PermalinkSettings,
  entries: PathEntry[],
  timeZone = 'UTC',
  tokens = new PermalinkTokenRegistry(),
) => {
  const expanded = new Map<string, string>();
  for (const { subject } of entries) {
    const path = await tokens.expand(
      permalinkPatternFor(settings, subject.type),
      {
        ...subject,
        timeZone,
        publishedAt: subject.publishedAt?.toISOString() ?? null,
        createdAt: subject.createdAt.toISOString(),
      },
    );
    const canonical = canonicalPermalinkPath(path);
    const custom = permalinkPatternFor(settings, subject.type)
      .split('%')
      .some(
        (part, index) =>
          index % 2 === 1 &&
          !(PERMALINK_TOKENS as readonly string[]).includes(part),
      );
    expanded.set(
      subject.id,
      canonical ??
        (custom
          ? contentPath({ ...settings, [subject.type]: '/%slug%' }, subject)
          : path),
    );
  }
  return pathChanges(settings, entries, timeZone, expanded);
};

/**
 * Plans `changes` against `owners` (the stored rows of every target path). Throws `conflict`,
 * before anything is written, when two items want one path or a target is another item's
 * current path (unless that item releases it in this plan) or redirect. An item may take back
 * one of its own redirects.
 */
export const planPathChanges = (
  changes: readonly PathChange[],
  owners: ReadonlyMap<string, StoredPath>,
): PathPlan => {
  const plan: PathPlan = { release: [], demote: [], promote: [], insert: [] };
  const released = new Set<string>();
  const targets = new Set<string>();

  for (const { from, retainPrevious } of changes)
    if (from !== null) (retainPrevious ? plan.demote : plan.release).push(from);
  for (const path of plan.release) released.add(path);

  for (const { contentId, to } of changes) {
    if (targets.has(to))
      throw conflict(
        Errors.PathInUse,
        withParams(Errors.PathInUse, { path: to }, 'path'),
      );
    targets.add(to);

    const owner = owners.get(to);

    if (owner?.contentId === contentId)
      plan.promote.push({ path: to, contentId });
    else if (!owner || (owner.current && released.has(to)))
      plan.insert.push({ path: to, contentId });
    else
      throw conflict(
        Errors.PathInUse,
        withParams(Errors.PathInUse, { path: to }, 'path'),
      );
  }

  return plan;
};
