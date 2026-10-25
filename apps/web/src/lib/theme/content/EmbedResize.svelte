<script lang="ts">
  /**
   * Embed iframes inside `container` (the entry's prose) that carry `data-embed-height-path`
   * take the height their page posts via `postMessage`. `html` re-runs this when the entry changes.
   */
  let {
    container,
    html,
  }: { container: HTMLElement | undefined; html: string } = $props();

  const pathAttribute = 'data-embed-height-path';

  /** Resolves an RFC 6901 JSON Pointer in `value`; `undefined` when it does not lead anywhere. */
  const resolvePointer = (value: unknown, pointer: string): unknown => {
    if (pointer === '') return value;
    if (!pointer.startsWith('/')) return undefined;
    let current = value;
    for (const raw of pointer.slice(1).split('/')) {
      if (/~(?![01])/.test(raw)) return undefined;
      const token = raw.replaceAll('~1', '/').replaceAll('~0', '~');
      if (Array.isArray(current)) {
        if (!/^(?:0|[1-9]\d*)$/.test(token)) return undefined;
        current = current[Number(token)];
      } else if (
        typeof current === 'object' &&
        current !== null &&
        Object.hasOwn(current, token)
      ) {
        current = (current as Record<string, unknown>)[token];
      } else return undefined;
    }
    return current;
  };

  const parseMessage = (data: unknown): unknown => {
    if (typeof data !== 'string') return data;
    if (data.length > 4096) return undefined;
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  };

  $effect(() => {
    const element = container;
    if (!element || !html.includes(pathAttribute)) return;
    const view = element.ownerDocument.defaultView;
    if (!view) return;

    const handleMessage = (event: MessageEvent) => {
      const iframe = [
        ...element.querySelectorAll<HTMLIFrameElement>(
          `iframe[${pathAttribute}]`,
        ),
      ].find((candidate) => candidate.contentWindow === event.source);
      if (!iframe) return;
      try {
        if (
          new URL(iframe.src, element.ownerDocument.baseURI).origin !==
          event.origin
        )
          return;
      } catch {
        return;
      }
      const height = resolvePointer(
        parseMessage(event.data),
        iframe.getAttribute(pathAttribute) ?? '',
      );
      if (
        typeof height !== 'number' ||
        !Number.isFinite(height) ||
        height < 1 ||
        height > 4096
      )
        return;
      iframe.style.aspectRatio = 'auto';
      iframe.style.height = `${Math.round(height)}px`;
    };

    view.addEventListener('message', handleMessage);
    return () => view.removeEventListener('message', handleMessage);
  });
</script>
