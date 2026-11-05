// See https://svelte.dev/docs/kit/types#app.d.ts
import type { PageAsset, UserProfile } from '@cms/sdk';
import type { contentApi } from '#lib/server/api.js';
import type { loadErrorData } from '#lib/server/theme-queries.js';
import type { MarkdownEntry } from '#lib/server/entry-representations.js';

declare global {
  namespace App {
    interface Error {
      message: string;
      themeError?: Awaited<ReturnType<typeof loadErrorData>>;
    }
    interface Locals {
      /** Public entry metadata for HTTP alternates, set only by an entry page load. */
      markdownEntry?: MarkdownEntry;
      siteLayout?: ReturnType<ReturnType<typeof contentApi>['layout']>;
      token: string | null;
      /** Set by `hooks.server.ts` for `/admin` requests with a valid session. */
      user: UserProfile | null;
      /** The page language for `<html lang>`, set by the public site and sign-in layouts. */
      lang?: string;
      /** The captcha widget's origins, set by pages that render it (`allowCaptcha`). */
      captchaOrigins?: string[];
      /** The admin screen's registered assets, whose origins the admin policy admits. */
      adminAssets?: PageAsset[];
    }
  }
}

export {};
