// See https://svelte.dev/docs/kit/types#app.d.ts
import type { UserProfile } from '@cms/sdk';

declare global {
  namespace App {
    interface Locals {
      token: string | null;
      /** Set by `hooks.server.ts` for `/admin` requests with a valid session. */
      user: UserProfile | null;
      /** The page language for `<html lang>`, set by the public site and sign-in layouts. */
      lang?: string;
    }
  }
}

export {};
