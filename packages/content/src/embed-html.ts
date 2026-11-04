import { Window } from 'happy-dom';
import { embedPermissions } from '@cms/sdk';
import { safeHttpsUrl } from '#content/urls';
import { parseHtml } from '#content/parse';
import { renderDocument } from '#content/render';

/** Filtered players retain only source URLs supplied by the selected provider. */
export const sanitizeEmbedHtml = (html: string, original: string): string => {
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  });
  const document = window.document;
  const source = document.createElement('template');
  const target = document.createElement('template');

  source.innerHTML = original;
  target.innerHTML = html;

  const sources = new Set(
    [...source.content.querySelectorAll('iframe')]
      .map((frame) => safeHttpsUrl(frame.getAttribute('src')))
      .filter((src): src is string => src !== null),
  );
  let prefix = 'CMS_EMBED_FRAME_';

  while (html.includes(prefix)) prefix += '_';

  const frames: string[] = [];

  for (const frame of target.content.querySelectorAll('iframe')) {
    const src = safeHttpsUrl(frame.getAttribute('src'));

    if (!src || !sources.has(src)) {
      frame.remove();
      continue;
    }

    const clean = document.createElement('iframe');

    clean.setAttribute('src', src);
    clean.setAttribute('title', frame.getAttribute('title') ?? '');
    clean.setAttribute('loading', 'lazy');
    clean.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    clean.setAttribute(
      'allow',
      embedPermissions(frame.getAttribute('allow') ?? '').join('; '),
    );

    if (frame.hasAttribute('allowfullscreen'))
      clean.setAttribute('allowfullscreen', '');

    const marker = document.createElement('p');

    marker.textContent = `${prefix}${frames.length}`;
    frames.push(clean.outerHTML);
    frame.replaceWith(marker);
  }

  let sanitized = renderDocument(parseHtml(target.innerHTML));

  frames.forEach((frame, index) => {
    sanitized = sanitized.replace(`<p>${prefix}${index}</p>`, frame);
  });

  return sanitized;
};
