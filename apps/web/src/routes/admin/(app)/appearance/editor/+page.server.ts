import { fail, redirect } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import {
  contentView,
  listView,
  menuView,
  readingView,
  siteView,
  themeView,
  widgetsView,
} from '#lib/server/public-view.js';
import { loadThemeQueries } from '#lib/server/theme-queries.js';
import type { ThemePage } from '#lib/theme/template.js';
import { TEMPLATE_NAME } from '@cms/sdk';
import type { ThemeEditor, ThemeStylesInput } from '@cms/sdk';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import { readBlocks } from '#lib/server/theme-admin.js';
import type { Actions, PageServerLoad } from './$types';

/** Template kinds an administrator can add (WordPress template hierarchy). */
const KINDS = [
  'front-page',
  'home',
  'single',
  'page',
  'archive',
  'category',
  'tag',
  'author',
  'date',
  'search',
  '404',
] as const;

const editorView = ({
  id,
  name,
  settings,
  styles,
  templates,
  parts,
}: ThemeEditor) => ({
  id,
  name,
  settings,
  styles,
  templates,
  parts,
});

/** `?theme=` picks the theme (the active one by default), `?edit=` what to edit. */
export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const themes = await admin.themes.list();
  const requested = event.url.searchParams.get('theme');
  const theme =
    themes.find((entry) => entry.id === requested) ??
    themes.find((entry) => entry.active) ??
    themes[0]!;
  const editor = editorView(await admin.themes.editor(theme.id));
  const api = contentApi(event.fetch);
  const preview = await admin.themes.preview(theme.id);
  const layout = await api.layout(preview.token);
  const posts = listView(await api.list({ pageSize: 6 }));
  const queries = await loadThemeQueries(api, layout.theme);
  const edit = event.url.searchParams.get('edit') ?? 'template:index';
  const template = edit.startsWith('template:')
    ? edit.slice('template:'.length)
    : '';
  const singular =
    /^(?:page|single)(?:-|$)/.test(template) || template === 'singular';
  let previewPage: ThemePage | null = { kind: 'home', type: 'post', posts };

  if (singular) {
    const types = await api.contentTypes();
    const type =
      template === 'page' || template.startsWith('page-')
        ? 'page'
        : (types
            .filter(
              ({ key }) =>
                template === `single-${key}` ||
                template.startsWith(`single-${key}-`),
            )
            .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? 'post');
    const sample = (await api.list({ type, pageSize: 1 })).items[0];
    previewPage = sample
      ? {
          kind: 'content',
          content: contentView(await api.getBySlug(sample.slug)),
        }
      : null;
  }

  return {
    themes: themes.map(({ id, name, active }) => ({ id, name, active })),
    editor,
    canvas: {
      theme: themeView(layout.theme),
      site: siteView(layout.site),
      reading: readingView(layout.reading),
      menus: {
        primary: layout.menus.primary && menuView(layout.menus.primary),
        footer: layout.menus.footer && menuView(layout.menus.footer),
      },
      widgets: widgetsView(layout.widgets),
      pages: [],
      queries,
    },
    posts,
    previewPage,
    edit,
    kinds: KINDS,
  };
};

const attempt = async (task: () => Promise<unknown>, notice = 'saved') => {
  try {
    await task();
  } catch (caught) {
    return failFrom(caught);
  }
  return { notice };
};

export const actions: Actions = {
  preview: async (event) => {
    const form = await event.request.formData();
    const read = readBlocks(form.get('blocks'));
    if ('failure' in read) return read.failure;

    try {
      const preview = await adminFor(event).themes.preview(text(form, 'theme'));
      const api = contentApi(event.fetch);
      const { theme } = await api.layout(preview.token);
      const kind = text(form, 'kind');
      const key = text(form, 'key');
      if (
        (kind !== 'template' && kind !== 'part') ||
        (kind === 'template' && !Object.hasOwn(theme.templates, key)) ||
        (kind === 'part' && !theme.parts.some((part) => part.slug === key))
      )
        return fail(400, { message: Errors.TemplateNameInvalid });

      const queries = await loadThemeQueries(api, {
        ...theme,
        templates: { index: read.blocks },
        parts: theme.parts.map((part) =>
          kind === 'part' && part.slug === key
            ? { ...part, blocks: read.blocks }
            : part,
        ),
      });
      return { queries };
    } catch (caught) {
      return failFrom(caught);
    }
  },
  addPart: async (event) => {
    const form = await event.request.formData();
    const theme = text(form, 'theme');
    const slug = text(form, 'slug').trim().toLowerCase();
    try {
      const admin = adminFor(event);
      const editor = await admin.themes.editor(theme);
      if (editor.parts.some((part) => part.slug === slug))
        return fail(400, { message: Errors.TemplateNameInvalid });
      await admin.themes.savePart(theme, slug, []);
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(
      303,
      `?theme=${encodeURIComponent(theme)}&edit=${encodeURIComponent(`part:${slug}`)}`,
    );
  },
  saveTemplate: async (event) => {
    const form = await event.request.formData();
    const read = readBlocks(form.get('blocks'));
    if ('failure' in read) return read.failure;
    return attempt(() =>
      adminFor(event).themes.saveTemplate(
        text(form, 'theme'),
        text(form, 'name'),
        read.blocks,
      ),
    );
  },
  resetTemplate: async (event) => {
    const form = await event.request.formData();
    return attempt(() =>
      adminFor(event).themes.resetTemplate(
        text(form, 'theme'),
        text(form, 'name'),
      ),
    );
  },
  savePart: async (event) => {
    const form = await event.request.formData();
    const read = readBlocks(form.get('blocks'));
    if ('failure' in read) return read.failure;
    return attempt(() =>
      adminFor(event).themes.savePart(
        text(form, 'theme'),
        text(form, 'slug'),
        read.blocks,
      ),
    );
  },
  resetPart: async (event) => {
    const form = await event.request.formData();
    return attempt(() =>
      adminFor(event).themes.resetPart(text(form, 'theme'), text(form, 'slug')),
    );
  },
  /** Adds a template to the hierarchy, starting from the template it would otherwise use. */
  addTemplate: async (event) => {
    const form = await event.request.formData();
    const theme = text(form, 'theme');
    const kind = text(form, 'kind');
    const slug = text(form, 'slug').trim().toLowerCase();
    const name = slug ? `${kind}-${slug}` : kind;
    if (!TEMPLATE_NAME.test(name))
      return fail(400, { message: Errors.TemplateNameInvalid });
    const admin = adminFor(event);
    try {
      const editor = await admin.themes.editor(theme);
      const find = (key: string) =>
        editor.templates.find((template) => template.name === key)?.blocks;
      const start = find(name) ?? find(kind) ?? find('index') ?? [];
      await admin.themes.saveTemplate(theme, name, start);
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(
      303,
      `?theme=${encodeURIComponent(theme)}&edit=${encodeURIComponent(`template:${name}`)}`,
    );
  },
  saveStyles: async (event) => {
    const form = await event.request.formData();
    const colors: Record<string, string> = {};
    for (const [key, value] of form)
      if (key.startsWith('color.') && typeof value === 'string')
        colors[key.slice('color.'.length)] = value;
    return attempt(() =>
      adminFor(event).themes.saveStyles(text(form, 'theme'), {
        colors,
        // The API checks every value against the theme schema.
        styles: {
          fontFamily: text(form, 'fontFamily'),
          headingFontFamily: text(form, 'headingFontFamily'),
          fontSize: text(form, 'fontSize'),
          lineHeight: text(form, 'lineHeight'),
          radius: text(form, 'radius'),
        } as ThemeStylesInput['styles'],
      }),
    );
  },
  resetStyles: async (event) => {
    const form = await event.request.formData();
    return attempt(() =>
      adminFor(event).themes.resetStyles(text(form, 'theme')),
    );
  },
};
