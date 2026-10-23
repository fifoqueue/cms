<script lang="ts">
  import { untrack } from 'svelte';
  interface Crop {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  interface Props {
    src: string;
    alt: string;
    /** Size of the original file; the crop is in its pixels. */
    width: number;
    height: number;
    crop: Crop;
    /** Width ÷ height to keep while resizing; null for free. */
    ratio: number | null;
    label: string;
  }

  let {
    src,
    alt,
    width,
    height,
    crop = $bindable(),
    ratio,
    label,
  }: Props = $props();

  let frame: HTMLDivElement;
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.min(Math.max(value, min), max));

  /** Keeps the box inside the image and, with a ratio, at that ratio. */
  const fit = (next: Crop): Crop => {
    let w = clamp(next.width, 1, width);
    let h = clamp(next.height, 1, height);
    if (ratio) {
      h = Math.round(w / ratio);
      if (h > height) {
        h = height;
        w = Math.round(h * ratio);
      }
    }
    return {
      left: clamp(next.left, 0, width - w),
      top: clamp(next.top, 0, height - h),
      width: w,
      height: h,
    };
  };

  // A new ratio applies to the current box at once. Only `ratio` is tracked, and the box is
  // replaced only when fitting changes it, so the effect cannot feed itself.
  $effect(() => {
    if (!ratio) return;
    untrack(() => {
      const next = fit(crop);
      if (
        next.left !== crop.left ||
        next.top !== crop.top ||
        next.width !== crop.width ||
        next.height !== crop.height
      )
        crop = next;
    });
  });

  /** Drags the box (`move`) or its lower-right corner (`resize`) in original pixels. */
  const drag = (mode: 'move' | 'resize') => (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const scale = width / frame.clientWidth;
    const start = { x: event.clientX, y: event.clientY, crop: { ...crop } };
    const onmove = (move: PointerEvent) => {
      const dx = (move.clientX - start.x) * scale;
      const dy = (move.clientY - start.y) * scale;
      crop =
        mode === 'move'
          ? fit({
              ...start.crop,
              left: start.crop.left + dx,
              top: start.crop.top + dy,
            })
          : fit({
              ...start.crop,
              width: start.crop.width + dx,
              height: start.crop.height + dy,
            });
    };
    const onup = () => {
      target.removeEventListener('pointermove', onmove);
      target.removeEventListener('pointerup', onup);
    };
    target.addEventListener('pointermove', onmove);
    target.addEventListener('pointerup', onup);
  };

  /** Arrow keys move the box; with Shift they resize it. */
  const keys = (event: KeyboardEvent) => {
    const step = Math.max(1, Math.round(width / 100));
    const [dx, dy] =
      {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[event.key] ?? [];
    if (dx === undefined || dy === undefined) return;
    event.preventDefault();
    crop = event.shiftKey
      ? fit({ ...crop, width: crop.width + dx, height: crop.height + dy })
      : fit({ ...crop, left: crop.left + dx, top: crop.top + dy });
  };

  const percent = (value: number, total: number) => `${(value / total) * 100}%`;
</script>

<div
  bind:this={frame}
  class="relative inline-block max-w-full touch-none overflow-hidden"
>
  <img
    {src}
    {alt}
    class="block max-h-[70vh] max-w-full select-none"
    draggable="false"
  />
  <!-- The darkened area outside the box is drawn by the box's shadow. -->
  <div
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuetext="{crop.width} × {crop.height}, {crop.left}, {crop.top}"
    aria-valuemin={0}
    aria-valuemax={width}
    aria-valuenow={crop.left}
    class="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
    style:left={percent(crop.left, width)}
    style:top={percent(crop.top, height)}
    style:width={percent(crop.width, width)}
    style:height={percent(crop.height, height)}
    onpointerdown={drag('move')}
    onkeydown={keys}
  >
    <span
      class="absolute right-0 bottom-0 size-4 cursor-se-resize rounded-sm border-2 border-white bg-primary"
      onpointerdown={drag('resize')}
      aria-hidden="true"
    ></span>
  </div>
</div>
