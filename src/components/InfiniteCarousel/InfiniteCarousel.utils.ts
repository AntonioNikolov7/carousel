import type { CarouselImage, VisibleItem } from "./InfiniteCarousel.types";

/* ── geometry ── */

export function computeItemWidths(
  images: CarouselImage[],
  height: number
): number[] {
  return images.map((img) => Math.round(height * (img.width / img.height)));
}

export function computePrefixSums(
  itemWidths: number[],
  gap: number
): Float64Array {
  const sums = new Float64Array(itemWidths.length + 1);
  for (let i = 0; i < itemWidths.length; i++) {
    sums[i + 1] = sums[i] + itemWidths[i] + gap;
  }
  return sums;
}

export function normalize(val: number, cycleLength: number): number {
  return ((val % cycleLength) + cycleLength) % cycleLength;
}

/* ── visibility ── */

export function findFirstVisible(
  prefixSums: Float64Array,
  offset: number,
  length: number
): number {
  let lowerBound = 0;
  let upperBound = length - 1;
  while (lowerBound < upperBound) {
    const midIndex = (lowerBound + upperBound) >> 1;
    const rightEdgeOfMid = prefixSums[midIndex + 1];
    if (rightEdgeOfMid <= offset) {
      lowerBound = midIndex + 1;
    } else {
      upperBound = midIndex;
    }
  }
  return lowerBound;
}

export interface GetVisibleItemsParams {
  scrollOffset: number;
  viewportWidth: number;
  cycleLength: number;
  prefixSums: Float64Array;
  itemWidths: number[];
  imagesLength: number;
  bufferPx: number;
}

export function getVisibleItems(params: GetVisibleItemsParams): VisibleItem[] {
  const {
    scrollOffset,
    viewportWidth,
    cycleLength,
    prefixSums,
    itemWidths,
    imagesLength,
    bufferPx,
  } = params;

  if (!imagesLength) return [];

  const offset = normalize(scrollOffset, cycleLength);
  const windowStart = offset - bufferPx;
  const windowEnd = offset + viewportWidth + bufferPx;

  const items: VisibleItem[] = [];
  const startCycle = Math.floor(windowStart / cycleLength);
  const endCycle = Math.floor(windowEnd / cycleLength);

  for (let cycle = startCycle; cycle <= endCycle; cycle++) {
    const cycleStart = cycle * cycleLength;
    const localStart = Math.max(0, windowStart - cycleStart);
    const localEnd = Math.min(cycleLength, windowEnd - cycleStart);

    if (localEnd <= 0 || localStart >= cycleLength) continue;

    let idx = findFirstVisible(prefixSums, localStart, imagesLength);
    while (idx < imagesLength && prefixSums[idx] < localEnd) {
      const x = cycleStart + prefixSums[idx] - offset;
      items.push({
        key: `${cycle}_${idx}`,
        index: idx,
        x,
        width: itemWidths[idx],
      });
      idx++;
    }
  }

  return items;
}

/* ── snap ── */

export interface GetSnapTargetParams {
  scrollOffset: number;
  viewportWidth: number;
  cycleLength: number;
  prefixSums: Float64Array;
  itemWidths: number[];
  imagesLength: number;
}

export function getSnapTarget(params: GetSnapTargetParams): number {
  const {
    scrollOffset,
    viewportWidth,
    cycleLength,
    prefixSums,
    itemWidths,
    imagesLength,
  } = params;

  const offset = normalize(scrollOffset, cycleLength);
  const center = offset + viewportWidth / 2;

  let best = 0;
  let bestDist = Infinity;

  for (let i = 0; i < imagesLength; i++) {
    const itemCenter = prefixSums[i] + itemWidths[i] / 2;
    const dist = Math.abs(itemCenter - (center % cycleLength));
    const distWrap = Math.abs(
      itemCenter - ((center % cycleLength) - cycleLength)
    );
    const d = Math.min(dist, distWrap);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }

  const targetCenter = prefixSums[best] + itemWidths[best] / 2;
  let target = targetCenter - viewportWidth / 2;
  const currentCycle = Math.round(scrollOffset / cycleLength);
  target += currentCycle * cycleLength;
  if (Math.abs(target - scrollOffset) > cycleLength / 2) {
    target += target < scrollOffset ? cycleLength : -cycleLength;
  }
  return target;
}

/* ── prefetch ── */

export interface PrefetchParams {
  images: CarouselImage[];
  visibleItems: VisibleItem[];
  velocity: number;
  cache: Set<string>;
  ahead: number;
  behind: number;
}

export function prefetchAround(params: PrefetchParams): void {
  const { images, visibleItems, velocity, cache, ahead, behind } = params;
  const n = images.length;
  if (!n) return;

  let minIdx = Infinity;
  let maxIdx = -Infinity;
  for (const item of visibleItems) {
    if (item.index < minIdx) minIdx = item.index;
    if (item.index > maxIdx) maxIdx = item.index;
  }
  if (minIdx === Infinity) return;

  const dir = velocity >= 0 ? 1 : -1;
  const forward = dir === 1 ? ahead : behind;
  const backward = dir === 1 ? behind : ahead;

  const toPrefetch: number[] = [];
  for (let i = 1; i <= forward; i++) {
    toPrefetch.push((((maxIdx + i) % n) + n) % n);
  }
  for (let i = 1; i <= backward; i++) {
    toPrefetch.push((((minIdx - i) % n) + n) % n);
  }

  for (const idx of toPrefetch) {
    const url = images[idx].src;
    if (!cache.has(url)) {
      cache.add(url);
      const img = new Image();
      img.src = url;
    }
  }
}
