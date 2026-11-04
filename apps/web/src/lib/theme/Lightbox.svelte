<script lang="ts" module>
  export interface LightboxItem {
    src: string;
    srcset?: string;
    alt: string;
    caption: string;
  }

  /** The widest `srcset` candidate and its declared width, else `src` with an unknown width. */
  const widest = (item: LightboxItem) => {
    let best = { url: item.src, width: 0 };
    for (const candidate of item.srcset?.split(',') ?? []) {
      const [url, descriptor = ''] = candidate.trim().split(/\s+/);
      const width = Number.parseInt(descriptor, 10);
      if (url && width > best.width) best = { url, width };
    }
    return best;
  };

  /**
   * Files that may hold the most pixels: the widest `srcset` candidate and `src`, which is not
   * necessarily listed in `srcset`. Absolute and deduplicated.
   */
  const originals = (item: LightboxItem) => [
    ...new Set(
      [widest(item).url, item.src].map(
        (url) => new URL(url, location.href).href,
      ),
    ),
  ];
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Dialog } from 'bits-ui';
  import { default as X } from '@lucide/svelte/icons/x';
  import { default as ChevronLeft } from '@lucide/svelte/icons/chevron-left';
  import { default as ChevronRight } from '@lucide/svelte/icons/chevron-right';
  import { default as ZoomIn } from '@lucide/svelte/icons/zoom-in';
  import { default as ZoomOut } from '@lucide/svelte/icons/zoom-out';
  import { default as Shrink } from '@lucide/svelte/icons/shrink';
  import { useI18n } from '#lib/i18n/context.js';

  /**
   * A full-screen image viewer, inside the site wrapper so the theme's variables apply. A larger
   * `srcset` candidate is chosen than in the column; several items get previous/next buttons,
   * the arrow keys and (on touch) swipes. The image zooms with pinch, wheel, double tap, the
   * `+`/`-`/`0` keys and buttons, and pans by dragging; zooming swaps in whichever of the widest
   * `srcset` candidate and `src` has the most pixels.
   */
  interface Props {
    items: LightboxItem[];
    index?: number;
    open: boolean;
  }

  let { items, index = $bindable(0), open = $bindable() }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const item = $derived(items[index]);

  const MAX_SCALE = 4;
  const KEY_STEP = 1.5;
  const KEY_PAN = 80;
  /** Pointer travel (px) after which a press is a drag rather than a tap. */
  const DRAG = 6;
  const SWIPE = 50;
  const DOUBLE_TAP_MS = 300;

  /** The image box at fit scale and its untransformed center, in viewport pixels. */
  interface Geometry {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }
  type Gesture =
    | {
        kind: 'pan';
        id: number;
        startX: number;
        startY: number;
        fromX: number;
        fromY: number;
        geometry: Geometry | null;
        moved: boolean;
        touch: boolean;
      }
    | {
        kind: 'pinch';
        distance: number;
        from: number;
        anchorX: number;
        anchorY: number;
        geometry: Geometry;
      };

  let stage = $state<HTMLDivElement>();
  let image = $state<HTMLImageElement>();
  let scale = $state(1);
  let x = $state(0);
  let y = $state(0);
  /** Discrete zoom steps animate; gestures and the wheel follow the pointer directly. */
  let smooth = $state(false);
  let full = $state<string | null>(null);
  /** True pixel width of the file swapped in on zoom (`naturalWidth` of a `srcset` image is density-corrected). */
  let pixels = 0;
  /** Fit size kept while the full file is shown, so a smaller original does not shrink the box. */
  let locked = $state<{ width: number; height: number } | null>(null);
  const zoomed = $derived(scale > 1);
  const source = $derived(item ? widest(item) : null);

  const pointers = new SvelteMap<
    number,
    { x: number; y: number; touch: boolean }
  >();
  let gesture: Gesture | null = null;
  let wheel: { factor: number; x: number; y: number } | null = null;
  let tap: { time: number; x: number; y: number } | null = null;
  let frame = 0;
  let pressedImage = false;
  let pressedBackdrop = false;
  let suppressClick = false;
  let requested = false;
  /** Off-screen loads of the zoom source; bumping `ticket` makes their completion stale. */
  let loaders: HTMLImageElement[] = [];
  let ticket = 0;

  const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), high);

  const step = (delta: number) => {
    index = (index + delta + items.length) % items.length;
  };

  /** Layout offsets ignore the transform, so this holds mid-transition too. */
  const measure = (): Geometry | null => {
    if (!image || !stage) return null;
    const origin = stage.getBoundingClientRect();
    return {
      width: image.offsetWidth,
      height: image.offsetHeight,
      centerX: origin.left + image.offsetLeft + image.offsetWidth / 2,
      centerY: origin.top + image.offsetTop + image.offsetHeight / 2,
    };
  };

  /** Keeps a box of `size` covering the viewport, or inside it when smaller. */
  const bound = (
    offset: number,
    size: number,
    center: number,
    viewport: number,
  ) => {
    const low = size / 2 - center;
    const high = viewport - size / 2 - center;
    return clamp(offset, Math.min(low, high), Math.max(low, high));
  };

  const fit = () => {
    scale = 1;
    x = 0;
    y = 0;
  };

  /** Drops the queued frame and aborts zoom-source loads (closing, another item, unmount). */
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    wheel = null;
    ticket++;
    for (const loader of loaders) loader.removeAttribute('src');
    loaders = [];
  };

  const reset = () => {
    stop();
    fit();
    smooth = false;
    full = null;
    pixels = 0;
    locked = null;
    requested = false;
    pointers.clear();
    gesture = null;
    tap = null;
  };

  /**
   * Decodes the candidates off-screen (the displayed one comes from cache) and swaps in the one
   * with the most pixels, so the swap does not flash.
   */
  const loadFull = () => {
    if (requested || !item || !image) return;
    requested = true;
    const urls = originals(item);
    if (urls.length === 1 && urls[0] === image.currentSrc) return;
    const current = ticket;
    const pending = urls.map((url) => {
      const loader = new Image();
      loader.src = url;
      return loader;
    });
    loaders = pending;
    void Promise.allSettled(pending.map((loader) => loader.decode())).then(
      (results) => {
        if (current !== ticket) return;
        loaders = [];
        const best = pending
          .filter((_, at) => results[at]?.status === 'fulfilled')
          .reduce<HTMLImageElement | null>(
            (most, loader) =>
              loader.naturalWidth > (most?.naturalWidth ?? 0) ? loader : most,
            null,
          );
        const geometry = measure();
        // The displayed candidate stays when no candidate could load.
        if (!best || !geometry) return;
        pixels = best.naturalWidth;
        if (best.src === image?.currentSrc) return;
        locked = { width: geometry.width, height: geometry.height };
        full = best.src;
      },
    );
  };

  /** Scales to `next` keeping image point (`anchorX`, `anchorY`, from center at scale 1) under the screen point. */
  const place = (
    next: number,
    anchorX: number,
    anchorY: number,
    screenX: number,
    screenY: number,
    geometry: Geometry,
  ) => {
    const target = clamp(next, 1, MAX_SCALE);
    if (target === 1) return fit();
    x = bound(
      screenX - geometry.centerX - target * anchorX,
      geometry.width * target,
      geometry.centerX,
      innerWidth,
    );
    y = bound(
      screenY - geometry.centerY - target * anchorY,
      geometry.height * target,
      geometry.centerY,
      innerHeight,
    );
    scale = target;
    loadFull();
  };

  const zoomTo = (next: number, screenX: number, screenY: number) => {
    const geometry = measure();
    if (!geometry) return;
    place(
      next,
      (screenX - geometry.centerX - x) / scale,
      (screenY - geometry.centerY - y) / scale,
      screenX,
      screenY,
      geometry,
    );
  };

  const zoomBy = (factor: number) => {
    smooth = true;
    zoomTo(scale * factor, innerWidth / 2, innerHeight / 2);
  };

  const panBy = (deltaX: number, deltaY: number) => {
    const geometry = measure();
    if (!geometry) return;
    smooth = true;
    x = bound(x + deltaX, geometry.width * scale, geometry.centerX, innerWidth);
    y = bound(
      y + deltaY,
      geometry.height * scale,
      geometry.centerY,
      innerHeight,
    );
  };

  /** Double tap: fit, or the original's 1:1 pixels (between 2× and the maximum). */
  const toggle = (screenX: number, screenY: number) => {
    smooth = true;
    if (zoomed) return fit();
    const geometry = measure();
    if (!geometry) return;
    const natural = Math.max(
      source?.width ?? 0,
      pixels,
      item?.srcset ? 0 : (image?.naturalWidth ?? 0),
    );
    zoomTo(clamp(natural / geometry.width, 2, MAX_SCALE), screenX, screenY);
  };

  const begin = (rebased: boolean) => {
    const [first, second] = [...pointers.entries()];
    if (second && first) {
      const geometry = measure();
      if (!geometry) {
        gesture = null;
        return;
      }
      const [a, b] = [first[1], second[1]];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      gesture = {
        kind: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        from: scale,
        anchorX: (midX - geometry.centerX - x) / scale,
        anchorY: (midY - geometry.centerY - y) / scale,
        geometry,
      };
    } else if (first) {
      const [id, point] = first;
      gesture = {
        kind: 'pan',
        id,
        startX: point.x,
        startY: point.y,
        fromX: x,
        fromY: y,
        geometry: measure(),
        moved: rebased,
        touch: point.touch,
      };
    } else gesture = null;
  };

  const update = () => {
    frame = 0;
    if (wheel) {
      zoomTo(scale * wheel.factor, wheel.x, wheel.y);
      wheel = null;
    }
    if (gesture?.kind === 'pinch') {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      place(
        (gesture.from * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.distance,
        gesture.anchorX,
        gesture.anchorY,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        gesture.geometry,
      );
    } else if (gesture?.kind === 'pan') {
      const point = pointers.get(gesture.id);
      if (!point) return;
      const deltaX = point.x - gesture.startX;
      const deltaY = point.y - gesture.startY;
      if (Math.hypot(deltaX, deltaY) > DRAG) gesture.moved = true;
      const geometry = gesture.geometry;
      if (!gesture.moved || !zoomed || !geometry) return;
      x = bound(
        gesture.fromX + deltaX,
        geometry.width * scale,
        geometry.centerX,
        innerWidth,
      );
      y = bound(
        gesture.fromY + deltaY,
        geometry.height * scale,
        geometry.centerY,
        innerHeight,
      );
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const press = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!pointers.size) {
      suppressClick = false;
      pressedImage = event.target === image;
      pressedBackdrop = event.target === stage;
    }
    stage?.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType !== 'mouse',
    });
    smooth = false;
    begin(false);
  };

  const move = (event: PointerEvent) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    schedule();
  };

  const release = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (frame) {
      cancelAnimationFrame(frame);
      update();
    }
    pointers.delete(event.pointerId);
    const ended = gesture;
    if (event.type === 'pointerup' && ended?.kind === 'pan') {
      const deltaX = event.clientX - ended.startX;
      const deltaY = event.clientY - ended.startY;
      if (ended.moved) {
        suppressClick = true;
        if (
          !zoomed &&
          ended.touch &&
          items.length > 1 &&
          Math.abs(deltaX) > SWIPE &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.5
        )
          return step(deltaX < 0 ? 1 : -1);
      } else if (pressedImage) {
        if (
          tap &&
          event.timeStamp - tap.time < DOUBLE_TAP_MS &&
          Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 30
        ) {
          tap = null;
          toggle(event.clientX, event.clientY);
        } else
          tap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      }
    }
    if (ended?.kind === 'pinch') suppressClick = true;
    begin(true);
  };

  /** A plain click on the backdrop closes; not after a drag, nor while zoomed. */
  const click = () => {
    if (pressedBackdrop && !suppressClick && !zoomed) open = false;
    suppressClick = false;
  };

  const scroll = (event: WheelEvent) => {
    event.preventDefault();
    // Trackpad pinches arrive as ctrl+wheel with small deltas; line deltas come from some mice.
    const speed = event.ctrlKey ? 0.01 : event.deltaMode === 1 ? 0.05 : 0.002;
    wheel = {
      factor: (wheel?.factor ?? 1) * Math.exp(-event.deltaY * speed),
      x: event.clientX,
      y: event.clientY,
    };
    smooth = false;
    schedule();
  };

  const keydown = (event: KeyboardEvent) => {
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [KEY_PAN, 0],
      ArrowRight: [-KEY_PAN, 0],
      ArrowUp: [0, KEY_PAN],
      ArrowDown: [0, -KEY_PAN],
    };
    if (event.key === '+' || event.key === '=') zoomBy(KEY_STEP);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / KEY_STEP);
    else if (event.key === '0') {
      smooth = true;
      fit();
    } else if (zoomed && pan[event.key]) panBy(...pan[event.key]!);
    else if (items.length > 1 && event.key === 'ArrowLeft') step(-1);
    else if (items.length > 1 && event.key === 'ArrowRight') step(1);
    else return;
    event.preventDefault();
  };

  // Another item, closing or a new layout starts again at fit.
  $effect(() => {
    void index;
    void open;
    untrack(reset);
    return stop;
  });

  $effect(() => {
    if (!open) return;
    const resize = () => reset();
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  });

  $effect(() => {
    const element = stage;
    if (!element) return;
    element.addEventListener('pointerdown', press);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('click', click);
    element.addEventListener('wheel', scroll, { passive: false });
    return () => {
      // A frame queued during the closing animation must not run against an unmounted stage.
      stop();
      element.removeEventListener('pointerdown', press);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', release);
      element.removeEventListener('pointercancel', release);
      element.removeEventListener('click', click);
      element.removeEventListener('wheel', scroll);
    };
  });

  const button =
    'flex size-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none';
  const control = `absolute z-10 ${button}`;
</script>

<Dialog.Root bind:open>
  <!-- Inside the site wrapper, which carries the theme's variables. -->
  <Dialog.Portal to=".cms-site">
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/85 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="fixed inset-0 z-50 outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      onkeydown={keydown}
    >
      <Dialog.Title class="sr-only">{m.themeLightboxTitle}</Dialog.Title>
      <!-- Pointer, click and wheel listeners are attached in the script (the wheel one non-passive). -->
      <div
        bind:this={stage}
        class="absolute inset-0 flex touch-none items-center justify-center overflow-hidden p-4 select-none sm:p-14"
      >
        {#if item}
          {#key index}
            <figure
              class="flex max-h-full max-w-full flex-col items-center gap-3"
            >
              <img
                bind:this={image}
                src={full ?? item.src}
                srcset={full ? undefined : item.srcset}
                sizes={!full && item.srcset ? '100vw' : undefined}
                alt={item.alt}
                draggable="false"
                class="max-h-[calc(100dvh-7rem)] max-w-full rounded-[var(--radius)] object-contain will-change-transform {smooth
                  ? 'transition-transform duration-200 ease-out motion-reduce:transition-none'
                  : ''} {zoomed
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-zoom-in'}"
                style:width={locked ? `${locked.width}px` : undefined}
                style:height={locked ? `${locked.height}px` : undefined}
                style:transform="translate3d({x}px, {y}px, 0) scale({scale})"
              />
              {#if item.caption}
                <figcaption
                  class="text-center text-sm text-white/80"
                  class:invisible={zoomed}
                >
                  {item.caption}
                </figcaption>
              {/if}
            </figure>
          {/key}
        {/if}
      </div>
      <div class="absolute top-3 left-3 z-10 flex gap-2">
        <button
          type="button"
          class={button}
          aria-label={m.themeLightboxZoomIn}
          onclick={() => zoomBy(KEY_STEP)}><ZoomIn class="size-5" /></button
        >
        <button
          type="button"
          class={button}
          aria-label={m.themeLightboxZoomOut}
          onclick={() => zoomBy(1 / KEY_STEP)}
          ><ZoomOut class="size-5" /></button
        >
        <button
          type="button"
          class={button}
          aria-label={m.themeLightboxZoomReset}
          onclick={() => {
            smooth = true;
            fit();
          }}><Shrink class="size-5" /></button
        >
      </div>
      {#if items.length > 1}
        <button
          type="button"
          class="{control} top-1/2 left-3 -translate-y-1/2"
          aria-label={m.themeLightboxPrevious}
          onclick={() => step(-1)}><ChevronLeft class="size-6" /></button
        >
        <button
          type="button"
          class="{control} top-1/2 right-3 -translate-y-1/2"
          aria-label={m.themeLightboxNext}
          onclick={() => step(1)}><ChevronRight class="size-6" /></button
        >
        <p
          class="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm text-white/80"
          aria-live="polite"
        >
          {m.themeLightboxPosition(index + 1, items.length)}
        </p>
      {/if}
      <Dialog.Close
        class="{control} top-3 right-3"
        aria-label={m.themeLightboxClose}><X class="size-5" /></Dialog.Close
      >
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
