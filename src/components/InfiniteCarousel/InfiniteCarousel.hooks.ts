import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type {
  CarouselImage,
  TouchRecord,
  VisibleItem,
} from "./InfiniteCarousel.types";
import {
  computeItemWidths,
  computePrefixSums,
  getSnapTarget,
  getVisibleItems,
  normalize,
  prefetchAround,
} from "./InfiniteCarousel.utils";
import {
  INITIAL_CYCLE_OFFSET,
  SNAP_EPSILON,
  TOUCH_DRAG_THRESHOLD_PX,
  TOUCH_FLICK_MAX_MS,
  TOUCH_FLICK_SCALE,
  WHEEL_VELOCITY_SCALE,
} from "./InfiniteCarousel.constants";

export interface UseInfiniteCarouselParams {
  images: CarouselImage[];
  height: number;
  gap: number;
  friction: number;
  minVelocity: number;
  snapSpeed: number;
  renderBufferPx: number;
  prefetchAhead: number;
  prefetchBehind: number;
  enableSnap: boolean;
  onIndexChange?: (index: number) => void;
}

export interface UseInfiniteCarouselResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  visibleItems: VisibleItem[];
  touchHandlers: {
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => void;
    onTouchMove: (e: TouchEvent<HTMLDivElement>) => void;
    onTouchEnd: (e: TouchEvent<HTMLDivElement>) => void;
  };
}

export function useInfiniteCarousel(
  params: UseInfiniteCarouselParams
): UseInfiniteCarouselResult {
  const {
    images,
    height,
    gap,
    friction,
    minVelocity,
    snapSpeed,
    renderBufferPx,
    prefetchAhead,
    prefetchBehind,
    enableSnap,
    onIndexChange,
  } = params;

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollOffset = useRef(0);
  const velocity = useRef(0);
  const rafId = useRef<number | null>(null);
  const isSnapping = useRef(false);
  const isDragging = useRef(false);
  const hasDraggedSignificantly = useRef(false);
  const initializedForImagesRef = useRef<CarouselImage[] | null>(null);
  const touchStart = useRef<TouchRecord>({ x: 0, y: 0, time: 0 });
  const touchLast = useRef<TouchRecord>({ x: 0, time: 0 });
  const prefetchedUrls = useRef<Set<string>>(new Set());
  const tickRef = useRef<() => void>(() => {});
  const lastReportedIndex = useRef<number>(-1);

  const [visibleItems, setVisibleItems] = useState<VisibleItem[]>([]);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  const itemWidths = useMemo(
    () => computeItemWidths(images, height),
    [images, height]
  );

  const prefixSums = useMemo(
    () => computePrefixSums(itemWidths, gap),
    [itemWidths, gap]
  );

  const cycleLength = prefixSums[prefixSums.length - 1] || 1;
  const imagesLength = images.length;

  const updateVisibleItems = useCallback((): VisibleItem[] => {
    const items = getVisibleItems({
      scrollOffset: scrollOffset.current,
      viewportWidth,
      cycleLength,
      prefixSums,
      itemWidths,
      imagesLength,
      bufferPx: renderBufferPx,
    });
    setVisibleItems(items);
    return items;
  }, [
    viewportWidth,
    cycleLength,
    prefixSums,
    itemWidths,
    imagesLength,
    renderBufferPx,
  ]);

  const scheduleFrame = useCallback((): void => {
    rafId.current = requestAnimationFrame(() => tickRef.current());
  }, []);

  const ensureAnimating = useCallback((): void => {
    if (!rafId.current) scheduleFrame();
  }, [scheduleFrame]);

  useEffect(() => {
    tickRef.current = () => {
      if (isDragging.current) {
        scheduleFrame();
        return;
      }

      let needsRender = false;

      if (isSnapping.current) {
        const target = getSnapTarget({
          scrollOffset: scrollOffset.current,
          viewportWidth,
          cycleLength,
          prefixSums,
          itemWidths,
          imagesLength,
        });
        const diff = target - scrollOffset.current;
        if (Math.abs(diff) < SNAP_EPSILON) {
          scrollOffset.current = target;
          isSnapping.current = false;
          needsRender = true;
        } else {
          scrollOffset.current += diff * snapSpeed;
          needsRender = true;
        }
      } else if (Math.abs(velocity.current) > minVelocity) {
        scrollOffset.current += velocity.current;
        velocity.current *= friction;
        needsRender = true;
      } else if (velocity.current !== 0) {
        velocity.current = 0;
        if (enableSnap) isSnapping.current = true;
        needsRender = true;
      }

      if (needsRender) {
        updateVisibleItems();
        scheduleFrame();
      } else {
        rafId.current = null;
      }
    };
  });

  const handleWheel = useCallback(
    (e: WheelEvent): void => {
      e.preventDefault();
      isSnapping.current = false;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      velocity.current += delta * WHEEL_VELOCITY_SCALE;
      ensureAnimating();
    },
    [ensureAnimating]
  );

  const handleTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>): void => {
      const t = e.touches[0];
      const now = Date.now();
      touchStart.current = { x: t.clientX, y: t.clientY, time: now };
      touchLast.current = { x: t.clientX, time: now };
      isDragging.current = true;
      hasDraggedSignificantly.current = false;
      velocity.current = 0;
      isSnapping.current = false;
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>): void => {
      if (!isDragging.current) return;
      const t = e.touches[0];
      const dx = touchLast.current.x - t.clientX;

      if (
        !hasDraggedSignificantly.current &&
        Math.abs(t.clientX - touchStart.current.x) > TOUCH_DRAG_THRESHOLD_PX
      ) {
        hasDraggedSignificantly.current = true;
      }

      if (hasDraggedSignificantly.current) {
        e.preventDefault();
      }

      scrollOffset.current += dx;
      touchLast.current = { x: t.clientX, time: Date.now() };
      updateVisibleItems();
    },
    [updateVisibleItems]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>): void => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const dt = Date.now() - touchLast.current.time;
      if (dt < TOUCH_FLICK_MAX_MS) {
        const lastTouch = e.changedTouches[0];
        const dx = touchLast.current.x - lastTouch.clientX;
        velocity.current = (dx / Math.max(dt, 1)) * TOUCH_FLICK_SCALE;
      } else if (enableSnap) {
        isSnapping.current = true;
      }
      ensureAnimating();
    },
    [ensureAnimating, enableSnap]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(
    () => () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    },
    []
  );

  useLayoutEffect(() => {
    if (!imagesLength || cycleLength <= 1) return;
    if (initializedForImagesRef.current === images) return;
    initializedForImagesRef.current = images;
    const centerFirstItem = (itemWidths[0] - viewportWidth) / 2;
    scrollOffset.current = cycleLength * INITIAL_CYCLE_OFFSET + centerFirstItem;
    velocity.current = 0;
    isSnapping.current = false;
  }, [images, imagesLength, cycleLength, itemWidths, viewportWidth]);

  useLayoutEffect(() => {
    updateVisibleItems();
  }, [updateVisibleItems]);

  useEffect(() => {
    prefetchAround({
      images,
      visibleItems,
      velocity: velocity.current,
      cache: prefetchedUrls.current,
      ahead: prefetchAhead,
      behind: prefetchBehind,
    });
  }, [images, visibleItems, prefetchAhead, prefetchBehind]);

  useEffect(() => {
    if (!onIndexChange || !imagesLength) return;
    const offset = normalize(scrollOffset.current, cycleLength);
    const center = (offset + viewportWidth / 2) % cycleLength;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < imagesLength; i++) {
      const itemCenter = prefixSums[i] + itemWidths[i] / 2;
      const d = Math.abs(itemCenter - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best !== lastReportedIndex.current) {
      lastReportedIndex.current = best;
      onIndexChange(best);
    }
  }, [
    visibleItems,
    onIndexChange,
    imagesLength,
    cycleLength,
    viewportWidth,
    prefixSums,
    itemWidths,
  ]);

  return {
    containerRef,
    visibleItems,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
