import { z } from 'zod';
import { Errors } from '#sdk/errors';
import { compileEmbedPattern } from '#sdk/embed-pattern';

const placeholder = /\{(\w+)(\|urlencode)?\}/g;

export const MAX_EMBED_URL_LENGTH = 2048;
export const EMBED_ALLOW_DIRECTIVES = [
  'accelerometer',
  'autoplay',
  'clipboard-write',
  'encrypted-media',
  'fullscreen',
  'gyroscope',
  'picture-in-picture',
  'web-share',
] as const;

const directives = (value: string) =>
  value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
const isDirective = (value: string) =>
  EMBED_ALLOW_DIRECTIVES.some((directive) => directive === value);

/** Reject whole directives with origin lists; never strip their origins and broaden access. */
export const embedPermissions = (value: string): string[] =>
  directives(value).filter(isDirective);

export const embedProviderSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    urlPattern: z
      .string()
      .min(1)
      .max(2000)
      .startsWith('^', Errors.EmbedPattern),
    src: z.string().min(1).max(2048),
    title: z.string().trim().min(1).max(300),
    allow: z
      .string()
      .max(500)
      .refine(
        (value) => directives(value).every(isDirective),
        Errors.EmbedAllow,
      )
      .default(''),
    sizing: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('ratio'),
        ratio: z
          .string()
          .max(40)
          .regex(/^[1-9]\d*(?:\.\d+)?\s*\/\s*[1-9]\d*(?:\.\d+)?$/),
      }),
      z.object({
        kind: z.literal('height'),
        height: z.number().int().min(1).max(4096),
        heightMessagePath: z
          .string()
          .max(500)
          .regex(/^(?:\/(?:[^~/]|~[01])*)*$/)
          .optional(),
        /**
         * The provider's natural width in px; the frame narrows with its container below it.
         * `null` is no limit; absent only in settings saved before this field existed.
         */
        maxWidth: z.number().int().min(1).max(4096).nullable().optional(),
      }),
    ]),
  })
  .superRefine((provider, context) => {
    const pattern = compileEmbedPattern(provider.urlPattern);
    if (!pattern) {
      context.addIssue({
        code: 'custom',
        path: ['urlPattern'],
        message: Errors.EmbedPattern,
      });
      return;
    }
    const head = /^https:\/\/[^/?#{]+(?=[/?#])/.exec(provider.src)?.[0];
    const sample = provider.src.replace(placeholder, 'value');
    if (
      !head ||
      !URL.canParse(head) ||
      !URL.canParse(sample) ||
      new URL(sample).origin !== new URL(head).origin ||
      new URL(sample).protocol !== 'https:' ||
      new URL(sample).username ||
      new URL(sample).password ||
      /[{}]/.test(sample)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['src'],
        message: Errors.EmbedSource,
      });
    }
    for (const match of provider.src.matchAll(placeholder)) {
      if (!pattern.names.includes(match[1]!))
        context.addIssue({
          code: 'custom',
          path: ['src'],
          message: Errors.EmbedPlaceholder,
        });
    }
  });

export type EmbedProviderSettings = z.output<typeof embedProviderSchema>;

const playerAllow =
  'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

export const DEFAULT_EMBED_PROVIDERS: EmbedProviderSettings[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    enabled: true,
    urlPattern:
      '^https?://(?:(?:www|m)\\.)?(?:youtu\\.be/|youtube\\.com/(?:(?:shorts|embed|live)/|watch\\?(?:[^#]*&)?v=))(?<id>[\\w-]{11})(?:[/?&#]|$)',
    src: 'https://www.youtube-nocookie.com/embed/{id}',
    title: 'YouTube video',
    allow: playerAllow,
    sizing: { kind: 'ratio', ratio: '16 / 9' },
  },
  {
    id: 'vimeo',
    label: 'Vimeo',
    enabled: true,
    urlPattern: '^https?://(?:www\\.)?vimeo\\.com/(?<id>\\d{1,12})(?:[?#]|$)',
    src: 'https://player.vimeo.com/video/{id}?dnt=1',
    title: 'Vimeo video',
    allow: playerAllow,
    sizing: { kind: 'ratio', ratio: '16 / 9' },
  },
  {
    id: 'x',
    label: 'X',
    enabled: true,
    urlPattern:
      '^https?://(?:(?:www|mobile)\\.)?(?:x|twitter)\\.com/(?:\\w+/status|i/web/status)/(?<id>\\d+)(?:[/?#]|$)',
    src: 'https://platform.twitter.com/embed/Tweet.html?id={id}&dnt=true',
    title: 'X post',
    allow: '',
    sizing: {
      kind: 'height',
      height: 600,
      heightMessagePath: '/twttr.embed/params/0/height',
      maxWidth: 550,
    },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    enabled: true,
    urlPattern:
      '^https?://(?:www\\.)?instagram\\.com/(?<kind>p|reel|tv)/(?<shortcode>[\\w-]+)(?:[/?#]|$)',
    src: 'https://www.instagram.com/{kind}/{shortcode}/embed/',
    title: 'Instagram post',
    allow: '',
    sizing: {
      kind: 'height',
      height: 700,
      heightMessagePath: '/details/height',
      maxWidth: 540,
    },
  },
];

export const embedSettingsSchema = z
  .object({
    providers: z
      .array(embedProviderSchema)
      .max(50)
      .default(() => structuredClone(DEFAULT_EMBED_PROVIDERS)),
  })
  .superRefine(({ providers }, context) => {
    const ids = new Set<string>();
    providers.forEach((provider, index) => {
      if (ids.has(provider.id))
        context.addIssue({
          code: 'custom',
          path: ['providers', index, 'id'],
          message: Errors.EmbedDuplicate,
        });
      ids.add(provider.id);
    });
  });
export type EmbedSettings = z.output<typeof embedSettingsSchema>;

export const publicEmbedProviderSchema = z.object({
  id: z.string(),
  label: z.string(),
  urlPattern: z.string(),
});
export type PublicEmbedProvider = z.output<typeof publicEmbedProviderSchema>;
