import { z } from 'zod';
import { menusSettingsSchema, publicMenuSchema } from '#sdk/menus';
import type {
  MenuLocation,
  MenusSettings,
  MenusSettingsInput,
  PublicMenuItem,
} from '#sdk/menus';
import { publicReadingSchema, readingSettingsSchema } from '#sdk/reading';
import { writingSettingsSchema } from '#sdk/writing';
import type { WritingSettings, WritingSettingsInput } from '#sdk/writing';
import type {
  PublicReading,
  ReadingSettings,
  ReadingSettingsInput,
} from '#sdk/reading';
import {
  CORE_WIDGETS,
  publicWidgetsSchema,
  widgetTypeSchema,
  widgetsSettingsSchema,
} from '#sdk/widgets';
import type {
  PublicWidgets,
  WidgetsSettings,
  WidgetsSettingsInput,
} from '#sdk/widgets';
import type { Request } from '#sdk/transport';
import { publicLayoutSchema } from '#sdk/layout';
import type { PublicLayout } from '#sdk/layout';

/** Reading settings, menus and widgets as the public site shows them. */
export const publicAppearanceClient = (request: Request) => ({
  layout: (preview?: string) =>
    request<PublicLayout>('GET', '/api/v1/layout', {
      query: { preview },
      response: publicLayoutSchema,
    }),
  reading: () =>
    request<PublicReading>('GET', '/api/v1/reading', {
      response: publicReadingSchema,
    }),
  menu: (location: MenuLocation) =>
    request<PublicMenuItem[] | null>(
      'GET',
      `/api/v1/menus/${encodeURIComponent(location)}`,
      { response: publicMenuSchema },
    ),
  widgets: () =>
    request<PublicWidgets>('GET', '/api/v1/widgets', {
      response: publicWidgetsSchema,
    }),
});

/** Reading needs `settings.manage`; menus and widgets `appearance.manage`. */
export const appearanceAdminClient = (request: Request) => ({
  /** Every writer reads the defaults; saving them needs `settings.manage`. */
  writing: {
    get: () =>
      request<WritingSettings>('GET', '/api/v1/admin/writing', {
        response: writingSettingsSchema,
      }),
    update: (input: WritingSettingsInput) =>
      request<WritingSettings>('PUT', '/api/v1/admin/writing', {
        json: input,
        response: writingSettingsSchema,
      }),
  },
  reading: {
    get: () =>
      request<ReadingSettings>('GET', '/api/v1/admin/reading', {
        response: readingSettingsSchema,
      }),
    update: (input: ReadingSettingsInput) =>
      request<ReadingSettings>('PUT', '/api/v1/admin/reading', {
        json: input,
        response: readingSettingsSchema,
      }),
  },
  menus: {
    get: () =>
      request<MenusSettings>('GET', '/api/v1/admin/menus', {
        response: menusSettingsSchema,
      }),
    update: (input: MenusSettingsInput) =>
      request<MenusSettings>('PUT', '/api/v1/admin/menus', {
        json: input,
        response: menusSettingsSchema,
      }),
  },
  widgets: {
    get: () =>
      request<WidgetsSettings>('GET', '/api/v1/admin/widgets', {
        response: widgetsSettingsSchema,
      }),
    types: () =>
      request<{
        core: (typeof CORE_WIDGETS)[number][];
        plugins: { type: string; name: string }[];
      }>('GET', '/api/v1/admin/widgets/types', {
        response: z.object({
          core: z.array(z.enum(CORE_WIDGETS)),
          plugins: z.array(widgetTypeSchema),
        }),
      }),
    update: (input: WidgetsSettingsInput) =>
      request<WidgetsSettings>('PUT', '/api/v1/admin/widgets', {
        json: input,
        response: widgetsSettingsSchema,
      }),
  },
});
