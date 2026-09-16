import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ImgHTMLAttributes, SyntheticEvent } from 'react';
import { flushSync } from 'react-dom';

interface Size {
  width: number;
  height: number;
}

interface Upscale {
  users: number;
  done: boolean;
  url: string | null;
  image: HTMLImageElement | null;
  notify: Set<() => void>;
}

const EPSILON = 0.001;
const IDLE_BYTES = 16 * 1024 * 1024;
const SLICE_MS = 8;

const DEVICE_BOX =
  typeof ResizeObserverEntry !== 'undefined' && 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;
const BOX: ResizeObserverOptions = { box: DEVICE_BOX ? 'device-pixel-content-box' : 'content-box' };

const targets = new Map<Element, (size: Size) => void>();
let observer: ResizeObserver | null = null;
let ratioQuery: MediaQueryList | null = null;

function deviceSize(entry: ResizeObserverEntry): Size {
  const box = DEVICE_BOX ? entry.devicePixelContentBoxSize[0] : undefined;
  if (box) return { width: box.inlineSize, height: box.blockSize };
  const ratio = window.devicePixelRatio || 1;
  return { width: entry.contentRect.width * ratio, height: entry.contentRect.height * ratio };
}

function armRatio() {
  const ratio = window.devicePixelRatio || 1;
  ratioQuery = matchMedia(`(min-resolution: ${ratio - EPSILON}dppx) and (max-resolution: ${ratio + EPSILON}dppx)`);
  ratioQuery.addEventListener(
    'change',
    () => {
      armRatio();
      for (const target of targets.keys()) {
        observer?.unobserve(target);
        observer?.observe(target, BOX);
      }
    },
    { once: true },
  );
}

function watchBox(target: Element, onSize: (size: Size) => void): () => void {
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      flushSync(() => {
        for (const entry of entries) targets.get(entry.target)?.(deviceSize(entry));
      });
    });
    armRatio();
  }
  targets.set(target, onSize);
  observer.observe(target, BOX);
  return () => {
    targets.delete(target);
    observer?.unobserve(target);
  };
}

const upscales = new Map<string, Upscale>();
const queue: Array<() => Promise<void>> = [];
let drainPending = false;
let trimPending = false;

function drain() {
  drainPending = false;
  const end = performance.now() + SLICE_MS;
  while (queue.length > 0 && performance.now() < end) queue.shift()!();
  if (queue.length > 0) scheduleDrain();
}

function scheduleDrain() {
  if (drainPending) return;
  drainPending = true;
  window.setTimeout(drain);
}

function trim() {
  trimPending = false;
  let idle = 0;
  for (const entry of upscales.values()) if (entry.users === 0) idle += entry.url?.length ?? 0;
  for (const [key, entry] of upscales) {
    if (idle <= IDLE_BYTES) break;
    if (entry.users > 0 || !entry.done) continue;
    upscales.delete(key);
    idle -= entry.url?.length ?? 0;
  }
}

function scheduleTrim() {
  if (trimPending) return;
  trimPending = true;
  window.setTimeout(trim);
}

async function upscale(src: string, factor: number): Promise<{ url: string; image: HTMLImageElement }> {
  const source = new Image();
  source.src = src;
  if (!source.complete || source.naturalWidth === 0) await source.decode();
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth * factor;
  canvas.height = source.naturalHeight * factor;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('canvas unavailable');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL();
  const image = new Image();
  image.src = url;
  await image.decode();
  return { url, image };
}

async function build(key: string, src: string, factor: number, entry: Upscale) {
  if (entry.users === 0) {
    if (upscales.get(key) === entry) upscales.delete(key);
    return;
  }
  try {
    const result = await upscale(src, factor);
    entry.url = result.url;
    entry.image = result.image;
  } catch {
    entry.url = null;
  }
  entry.done = true;
  for (const notify of entry.notify) notify();
  if (entry.users === 0) scheduleTrim();
}

function lease(key: string, src: string, factor: number, notify: () => void): () => void {
  const known = upscales.get(key);
  const held: Upscale = known ?? { users: 0, done: false, url: null, image: null, notify: new Set() };
  held.users += 1;
  held.notify.add(notify);
  if (!known) {
    upscales.set(key, held);
    queue.push(() => build(key, src, factor, held));
    scheduleDrain();
  }
  return () => {
    held.notify.delete(notify);
    held.users -= 1;
    if (held.users > 0 || upscales.get(key) !== held) return;
    upscales.delete(key);
    upscales.set(key, held);
    scheduleTrim();
  };
}

function useUpscale(src: string, factor: number): string | null {
  const key = factor > 1 ? `${factor}x${src}` : '';
  const subscribe = useCallback(
    (notify: () => void) => (key ? lease(key, src, factor, notify) : () => undefined),
    [key, src, factor],
  );
  return useSyncExternalStore(subscribe, () => (key ? (upscales.get(key)?.url ?? null) : null));
}

function factorOf(scale: number): number {
  const whole = Math.round(scale);
  if (whole >= 1 && Math.abs(scale - whole) < EPSILON) return 1;
  if (scale < 1) return 0;
  return Math.ceil(scale);
}

export function Sprite({
  src,
  onLoad,
  onError,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<Size | null>(null);
  const [natural, setNatural] = useState<(Size & { src: string }) | null>(null);
  const [broken, setBroken] = useState<string | null>(null);

  useLayoutEffect(
    () =>
      watchBox(ref.current!, (size) =>
        setBox((prev) => (prev && prev.width === size.width && prev.height === size.height ? prev : size)),
      ),
    [],
  );

  useLayoutEffect(() => {
    const image = ref.current!;
    if (image.getAttribute('src') === src && image.complete && image.naturalWidth > 0) {
      setNatural({ src, width: image.naturalWidth, height: image.naturalHeight });
    }
  }, [src]);

  const known = natural?.src === src ? natural : null;
  const scale = box && known ? Math.min(box.width / known.width, box.height / known.height) : null;
  const factor = scale === null ? 0 : factorOf(scale);
  const upscaled = useUpscale(src, factor);
  const look =
    broken === src
      ? 'smooth'
      : scale === null
        ? 'wait'
        : factor === 0
          ? 'smooth'
          : factor === 1 || !upscaled
            ? 'pixel'
            : 'sharp';

  const loaded = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.getAttribute('src') === src) {
      setNatural({ src, width: image.naturalWidth, height: image.naturalHeight });
    }
    onLoad?.(event);
  };

  const failed = (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.getAttribute('src') === src) setBroken(src);
    onError?.(event);
  };

  return <img {...rest} ref={ref} src={upscaled ?? src} data-render={look} onLoad={loaded} onError={failed} />;
}
