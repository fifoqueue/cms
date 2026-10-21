import { definePlugin } from '@cms/sdk/plugin';

const WORD = /[\p{L}\p{N}]+/gu;

export const readingMinutes = (html: string, wordsPerMinute: number) => {
  const words = html.replace(/<[^>]*>/g, ' ').match(WORD)?.length ?? 0;
  return Math.max(1, Math.round(words / Math.max(1, wordsPerMinute)));
};

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const plugin = definePlugin({
  manifest: {
    id: 'reading-time',
    name: 'Reading time',
    version: '1.0.0',
    description: 'Adds an estimated reading time to published content.',
    settings: [
      {
        key: 'wordsPerMinute',
        label: 'Words per minute',
        type: 'number',
        default: 200,
      },
      {
        key: 'label',
        label: 'Label',
        type: 'text',
        default: '{minutes} min read',
        description: '{minutes} is replaced with the estimate.',
      },
      {
        key: 'onPages',
        label: 'Show on pages',
        type: 'boolean',
        default: false,
      },
    ],
  },

  activate({ hooks, slots, settings }) {
    const minutesFor = async (html: string) =>
      readingMinutes(html, Number(await settings.get('wordsPerMinute')));

    // Data for API consumers: `meta.readingTime` on every published item.
    hooks.filter('content.public', async (content) => ({
      ...content,
      meta: { ...content.meta, readingTime: await minutesFor(content.html) },
    }));

    // Markup for the bundled theme, through the generic slot contract.
    slots.provide('content.before', async ({ content }) => {
      if (
        !content ||
        (content.type === 'page' && !(await settings.get('onPages')))
      )
        return '';
      const label = String(await settings.get('label')).replace(
        '{minutes}',
        String(await minutesFor(content.html)),
      );
      return `<p class="cms-reading-time" style="font-size:.875rem;opacity:.7">${escapeHtml(label)}</p>`;
    });
  },
});
