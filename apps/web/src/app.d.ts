// See https://svelte.dev/docs/kit/types#app.d.ts
import type { UserProfile } from '@cms/sdk';
import type { contentApi } from '#lib/server/api.js';
declare global {
  namespace App {
    interface Locals {
      siteLayout?: ReturnType<ReturnType<typeof contentApi>['layout']>;
      token: string | null;
      /** Set by `hooks.server.ts` for `/admin` requests with a valid session. */
      user: UserProfile | null;
      /** The page language for `<html lang>`, set by the public site and sign-in layouts. */
      lang?: string;
      /** The captcha widget's origins, set by pages that render it (`allowCaptcha`). */
      captchaOrigins?: string[];
    }
  }
}

export {};
