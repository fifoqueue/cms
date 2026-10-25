import type { Messages } from '#lib/i18n/index.js';

/** Label of an image size: core sizes are translated, registered (plugin) sizes show their name. */
export const sizeLabel = (m: Messages, name: string) => {
  switch (name) {
    case 'thumbnail':
      return m.sizeThumbnail;
    case 'medium':
      return m.sizeMedium;
    case 'large':
      return m.sizeLarge;
    default:
      return name;
  }
};
