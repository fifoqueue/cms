import { systemEmailSchema } from '@cms/sdk/plugin';
import type { SystemEmailContext } from '@cms/sdk/plugin';
import type { HookDispatcher } from '#api/domain/ports';
import { parseHtml } from '@cms/content/parse';
import { renderDocument } from '@cms/content/render';

export interface SystemMail {
  kind: string;
  actionUrl?: string;
  context: SystemEmailContext;
}

const marker = 'https://cms.invalid/action';
const occurrences = (text: string, value: string) =>
  text.split(value).length - 1;

/** Protected URLs retain their standalone text line and never enter the subject. */
export const protectedText = (
  original: { text: string },
  candidate: { subject: string; text: string },
  url: string,
) => {
  if (candidate.subject.includes(url)) return false;
  if (occurrences(original.text, url) !== occurrences(candidate.text, url))
    return false;

  const before = original.text.split('\n');
  const after = candidate.text.split('\n');

  return before.every(
    (line, index) =>
      !line.includes(url) ||
      (line.trim() === url && after[index]?.trim() === url),
  );
};

const tokenCount = (text: string) => {
  const tokens = text.split(/\s+/).filter((part) => part.includes(marker));

  return tokens.every((part) => part === marker) ? tokens.length : -1;
};

/** Protected markers occur only in sanitized anchor destinations, never in labels. */
const validHtml = (html: string, expected: number) => {
  let anchors = 0;
  let valid = true;
  const remainder = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, (anchor) => {
    if (!anchor.includes(marker)) return anchor;

    const end = anchor.indexOf('>') + 1;
    const opening = anchor.slice(0, end);
    const label = anchor.slice(end, -4);
    const destination = `href="${marker}"`;

    if (
      !opening.includes(destination) ||
      opening.replace(destination, '').includes(marker) ||
      label.includes(marker)
    ) {
      valid = false;

      return anchor;
    }

    anchors++;

    return anchor.replaceAll(marker, '');
  });

  return valid && anchors === expected && !remainder.includes(marker);
};

/** Action credentials stay outside filters; the protected URL is restored only after validation. */
export const filterSystemMail = async (
  hooks: HookDispatcher | undefined,
  message: { subject: string; text: string; html?: string },
  system: SystemMail,
) => {
  if (!hooks?.has('email.system')) return message;

  const expected = system.actionUrl
    ? occurrences(message.text, system.actionUrl)
    : 0;
  const sanitized = new Map<string, string>();
  const sanitize = (html: string) => {
    if (!sanitized.has(html))
      sanitized.set(html, renderDocument(parseHtml(html)));

    return sanitized.get(html)!;
  };
  const mask = (text: string) =>
    system.actionUrl ? text.replaceAll(system.actionUrl, marker) : text;
  const original = {
    kind: system.kind,
    subject: message.subject,
    text: mask(message.text),
    ...(message.html !== undefined && { html: mask(message.html) }),
  };
  let rejectedLinks = false;
  const filtered = await hooks.applyFilter(
    'email.system',
    original,
    (value) => {
      const parsed = systemEmailSchema.safeParse(value);

      if (!parsed.success || parsed.data.kind !== system.kind) return false;
      if (!system.actionUrl) return true;

      const valid =
        !parsed.data.subject.includes(marker) &&
        tokenCount(parsed.data.text) === expected &&
        (parsed.data.html === undefined ||
          validHtml(sanitize(parsed.data.html), expected));

      if (!valid) rejectedLinks = true;

      return valid;
    },
    undefined,
    [system.context],
  );

  if (rejectedLinks) return message;

  const restore = (text: string) =>
    system.actionUrl ? text.replaceAll(marker, system.actionUrl) : text;

  return {
    subject: filtered.subject,
    text: restore(filtered.text),
    ...(filtered.html !== undefined && {
      html: sanitize(filtered.html).replaceAll(
        `href="${marker}"`,
        `href="${(system.actionUrl ?? marker)
          .replaceAll('&', '&amp;')
          .replaceAll('"', '&quot;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')}"`,
      ),
    }),
  };
};
