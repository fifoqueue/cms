import { Window } from 'happy-dom';
import type { Element, Node } from 'happy-dom';
import { parseHtml } from '#content/parse';
import { renderDocument } from '#content/render';

const BLOCKS =
  'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table,figure,hr,dl,details,section,article,aside,header,footer';
const PHRASING = 'p,h1,h2,h3,h4,h5,h6';
const EXCLUDED = 'code,pre,script,style,textarea,template,noscript,svg,math';
const createWindow = () =>
  new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  });

/** Inline output loses only the paragraph synthesized by the document parser. */
export const sanitizeShortcodeHtml = (html: string): string => {
  const template = createWindow().document.createElement('template');

  template.innerHTML = html;

  const inline = !template.content.querySelector(BLOCKS);
  const document = parseHtml(html);
  const rendered = renderDocument(document);

  if (
    !inline ||
    document.content?.length !== 1 ||
    document.content[0]?.type !== 'paragraph'
  )
    return rendered;

  template.innerHTML = rendered;

  return template.content.firstElementChild?.innerHTML ?? '';
};

/** Splits phrasing containers and inline ancestors around an inserted block. */
const liftBlock = (block: Element) => {
  const container = block.parentElement?.closest(PHRASING);

  if (!container) return;

  while (block.parentElement) {
    const parent = block.parentElement;
    const before = parent.cloneNode(false);
    const after = parent.cloneNode(false);
    let following = false;

    for (const child of [...parent.childNodes]) {
      if (child === block) following = true;
      else (following ? after : before).appendChild(child);
    }

    parent.replaceWith(
      ...(before.hasChildNodes() ? [before] : []),
      block,
      ...(after.hasChildNodes() ? [after] : []),
    );

    if (parent === container) break;
  }
};

/** Transforms original text nodes outside literal regions, never attributes or generated output. */
export const mapContentText = async (
  html: string,
  transform: (text: string) => Promise<string>,
): Promise<string> => {
  const window = createWindow();
  const template = window.document.createElement('template');

  template.innerHTML = html;

  const texts: Node[] = [];
  const collect = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        if (!child.parentElement?.closest(EXCLUDED)) texts.push(child);
      } else collect(child);
    }
  };

  collect(template.content);

  for (const child of texts) {
    const text = child.textContent;
    const output = await transform(text);

    if (output === text) continue;

    const replacement = window.document.createElement('template');

    replacement.innerHTML = output;

    const blocks = [...replacement.content.querySelectorAll(BLOCKS)];

    child.parentNode?.replaceChild(replacement.content, child);

    for (const block of blocks) liftBlock(block);
  }

  return template.innerHTML;
};
