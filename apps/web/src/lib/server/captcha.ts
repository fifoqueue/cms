import type { PublicCaptcha } from '@cms/sdk';

/**
 * The directives governing each kind of request a widget makes: its scripts (providers load
 * further scripts from their other origins), frames, requests, images and styles. `own` are the
 * kind's own directives, most specific first: the first one the policy sets is the one browsers
 * apply, and it gains the origins. Without one, a shared fallback (`child-src`, `default-src`)
 * applies; it is spelled out as the kind's base directive (the last `own` one) instead of
 * widened, so nothing else gains the origins. A kind the policy leaves unrestricted stays so.
 */
const KINDS = [
  { own: ['script-src-elem', 'script-src'], fallback: ['default-src'] },
  { own: ['frame-src'], fallback: ['child-src', 'default-src'] },
  { own: ['connect-src'], fallback: ['default-src'] },
  { own: ['img-src'], fallback: ['default-src'] },
  { own: ['style-src-elem', 'style-src'], fallback: ['default-src'] },
] as const;

/**
 * Records that this page renders the captcha widget, so the response's policy admits the
 * widget's origins (`hooks.server.ts`). Returns the captcha unchanged for page data.
 */
export const allowCaptcha = <
  T extends Pick<PublicCaptcha, 'provider' | 'widget'> | null | undefined,
>(
  event: { locals: App.Locals },
  captcha: T,
): T => {
  if (captcha && captcha.provider !== 'none' && captcha.widget) {
    const { scriptOrigin, origins } = captcha.widget;
    event.locals.captchaOrigins = [...new Set([scriptOrigin, ...origins])];
  }
  return captcha;
};

/** `sources` plus `origins`; `'none'` gives way to them. */
const admit = (sources: readonly string[], origins: readonly string[]) => [
  ...(sources.length === 1 && sources[0] === "'none'" ? [] : sources),
  ...origins.filter((origin) => !sources.includes(origin)),
];

/**
 * One Content-Security-Policy that also admits the widget's origins wherever it restricts what
 * the widget loads (`KINDS`). A policy that restricts none of it (as this app's own does) stays
 * as it is, since adding a directive would only forbid everything else.
 */
export const withWidgetOrigins = (
  policy: string,
  origins: readonly string[],
) => {
  if (!origins.length) return policy;
  const directives = policy
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name = '', ...sources] = part.split(/\s+/);
      return { name: name.toLowerCase(), sources };
    });
  // Browsers apply the first of repeated directives.
  const find = (name: string) =>
    directives.find((directive) => directive.name === name);
  for (const kind of KINDS) {
    const own = kind.own.map(find).find(Boolean);
    if (own) {
      own.sources = admit(own.sources, origins);
      continue;
    }
    const fallback = kind.fallback.map(find).find(Boolean);
    if (fallback)
      directives.push({
        name: kind.own.at(-1)!,
        sources: admit(fallback.sources, origins),
      });
  }
  return directives
    .map(({ name, sources }) => [name, ...sources].join(' '))
    .join('; ');
};
