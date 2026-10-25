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
import { contextOf, loadThemeData } from '#lib/server/theme-queries.js';
import type { ThemePage } from '#lib/theme/template.js';
import { TEMPLATE_NAME } from '@cms/sdk';
import type { ThemeEditor, ThemeStylesInput } from '@cms/sdk';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import { fontsAfter, readBlocks } from '#lib/server/theme-admin.js';
import { FONT_FIELDS } from '#lib/admin/font-issues.js';
import type { FontFormValues } from '#lib/admin/font-issues.js';
import { submitAction } from '#lib/server/form-action.js';
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
  siteFonts,
  styles,
  templates,
  parts,
}: ThemeEditor) => ({
  id,
  name,
  settings,
  siteFonts: siteFonts.map((font) => ({
    slug: font.slug,
    family: font.family,
    fallback: font.fallback,
    stylesheet: font.stylesheet,
    faces: font.faces.map(({ src, weight, style, display }) => ({
      src,
      weight,
      style,
      display,
    })),
  })),
  styles,
  // `source` is `theme`, `admin` or the contributing plugin's id.
  templates: templates.map(
    ({ name, blocks, inTheme, customized, source, readOnly }) => ({
      name,
      blocks,
      inTheme,
      customized,
      source,
      readOnly,
    }),
  ),
  parts: parts.map(
    ({ slug, title, area, blocks, inTheme, customized, source, readOnly }) => ({
      slug,
      title,
      area,
      blocks,
      inTheme,
      customized,
      source,
      readOnly,
    }),
  ),
});

/** A template (by name) or part (by slug) of the site editor. */
const itemOf = (editor: ThemeEditor, kind: 'template' | 'part', key: string) =>
  kind === 'part'
    ? editor.parts.find((part) => part.slug === key)
    : editor.templates.find((template) => template.name === key);

/** Plugin-provided items stay read-only until customized (`customize`). */
const readOnly = (
  editor: ThemeEditor,
  kind: 'template' | 'part',
  key: string,
) => itemOf(editor, kind, key)?.readOnly === true;

const readOnlyFailure = () =>
  fail(409, { message: Errors.ThemeItemReadOnly, code: 'conflict' });

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

  const blocks = await loadThemeData(api, layout.theme, {
    ...(previewPage
      ? contextOf(previewPage)
      : { entry: null, month: null, authors: [] }),
    timeZone: layout.reading.timeZone,
  });

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
      ...blocks,
    },
    posts,
    previewPage,
    edit,
    kinds: KINDS,
  };
};

export const actions: Actions = {
  preview: async (event) => {
    const form = await event.request.formData();
    const read = readBlocks(form.get('blocks'));
    if ('failure' in read) return read.failure;

    try {
      const preview = await adminFor(event).themes.preview(text(form, 'theme'));
      const api = contentApi(event.fetch);
      const { theme, reading } = await api.layout(preview.token);
      const kind = text(form, 'kind');
      const key = text(form, 'key');
      if (
        (kind !== 'template' && kind !== 'part') ||
        (kind === 'template' && !Object.hasOwn(theme.templates, key)) ||
        (kind === 'part' && !theme.parts.some((part) => part.slug === key))
      )
        return fail(400, { message: Errors.TemplateNameInvalid });

      // The public neighbour lookup answers for published entries only.
      const contentId = text(form, 'contentId');
      const author = text(form, 'author');
      return await loadThemeData(
        api,
        {
          templates: { index: read.blocks },
          parts: theme.parts.map((part) =>
            kind === 'part' && part.slug === key
              ? { ...part, blocks: read.blocks }
              : part,
          ),
        },
        {
          entry: contentId ? { id: contentId, author: author || null } : null,
          month: null,
          authors: [],
          timeZone: reading.timeZone,
        },
      );
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
    const admin = adminFor(event);
    const theme = text(form, 'theme');
    const name = text(form, 'name');
    try {
      if (readOnly(await admin.themes.editor(theme), 'template', name))
        return readOnlyFailure();
    } catch (caught) {
      return failFrom(caught);
    }
    return submitAction(() =>
      admin.themes.saveTemplate(theme, name, read.blocks),
    );
  },
  /**
   * Turns a read-only plugin template or part into the administrator's own copy: its current
   * blocks are saved as a customization, which then overrides the plugin's version.
   */
  customize: async (event) => {
    const form = await event.request.formData();
    const theme = text(form, 'theme');
    const kind = text(form, 'kind') === 'part' ? 'part' : 'template';
    const key = text(form, 'key');
    const admin = adminFor(event);
    try {
      const editor = await admin.themes.editor(theme);
      const item = itemOf(editor, kind, key);
      if (!item) return fail(404, { message: Errors.NotFound });
      if (item.readOnly) {
        if (kind === 'part')
          await admin.themes.savePart(theme, key, item.blocks);
        else await admin.themes.saveTemplate(theme, key, item.blocks);
      }
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(
      303,
      `?theme=${encodeURIComponent(theme)}&edit=${encodeURIComponent(`${kind}:${key}`)}`,
    );
  },
  resetTemplate: async (event) => {
    const form = await event.request.formData();
    return submitAction(() =>
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
    const admin = adminFor(event);
    const theme = text(form, 'theme');
    const slug = text(form, 'slug');
    try {
      if (readOnly(await admin.themes.editor(theme), 'part', slug))
        return readOnlyFailure();
    } catch (caught) {
      return failFrom(caught);
    }
    return submitAction(() => admin.themes.savePart(theme, slug, read.blocks));
  },
  resetPart: async (event) => {
    const form = await event.request.formData();
    return submitAction(() =>
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
    return submitAction(() =>
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
  /** Adds a site font (or a face to an existing family) or removes one; the API validates. */
  saveFonts: async (event) => {
    const form = await event.request.formData();
    const admin = adminFor(event);
    try {
      const fonts = await admin.themes.fonts();
      const next = fontsAfter(fonts, form);
      if (next) await admin.themes.saveFonts({ fonts: next });
    } catch (caught) {
      // Shown inside the site fonts section, with what was entered kept.
      return failFrom(caught, {
        fontForm: Object.fromEntries(
          [...FONT_FIELDS, 'source'].map((key) => [key, text(form, key)]),
        ) as FontFormValues,
      });
    }
    // Back to the Styles panel of the theme being edited.
    redirect(
      303,
      `?theme=${encodeURIComponent(text(form, 'theme'))}&edit=styles&notice=saved`,
    );
  },
  resetStyles: async (event) => {
    const form = await event.request.formData();
    return submitAction(() =>
      adminFor(event).themes.resetStyles(text(form, 'theme')),
    );
  },
};
