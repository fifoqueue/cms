import { translationResponseSchema } from '#sdk/hooks/i18n';
import type { Request } from '#sdk/transport';

export const i18nClient = (request: Request, scope: 'site' | 'admin') => ({
  i18n: {
    messages: (locale: string) =>
      request<{ locale: string; messages: Record<string, string> }>(
        'GET',
        '/api/v1/i18n/messages',
        {
          query: { locale, scope },
          response: translationResponseSchema,
        },
      ),
  },
});
