import { z } from 'zod';

export const DATE_FORMATS = ['long', 'medium', 'short', 'iso'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** A valid IANA time zone name. */
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  });

/** What the front page shows and how lists and dates are presented (WordPress "Reading"). */
export const readingSettingsSchema = z.object({
  /** `posts`: the latest posts; `page`: a static page, with the posts on `postsPageId`. */
  frontPage: z.enum(['posts', 'page']).default('posts'),
  frontPageId: z.string().max(36).nullable().default(null),
  postsPageId: z.string().max(36).nullable().default(null),
  postsPerPage: z.number().int().min(1).max(100).default(10),
  feedItems: z.number().int().min(1).max(100).default(20),
  /** What each feed item carries: the full text (WordPress default) or the excerpt only. */
  feedContent: z.enum(['full', 'excerpt']).default('full'),
  dateFormat: z.enum(DATE_FORMATS).default('long'),
  /** Dates on the site show in this zone. Permalinks always use UTC. */
  timeZone: timeZoneSchema.default('UTC'),
  /** First day of a week in calendars: 0 Sunday … 6 Saturday (WordPress "Week Starts On"). */
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  /** Seconds a CDN or proxy may keep public pages for anonymous visitors; 0 turns it off. */
  cacheSeconds: z.number().int().min(0).max(3600).default(0),
});

export type ReadingSettings = z.output<typeof readingSettingsSchema>;
export type ReadingSettingsInput = z.input<typeof readingSettingsSchema>;

export const DEFAULT_READING_SETTINGS: ReadingSettings =
  readingSettingsSchema.parse({});

/** Public reading settings with the front and posts pages resolved to their paths. */
export const publicReadingSchema = readingSettingsSchema.extend({
  frontPagePath: z.string().nullable(),
  postsPagePath: z.string().nullable(),
});

export type PublicReading = z.output<typeof publicReadingSchema>;
