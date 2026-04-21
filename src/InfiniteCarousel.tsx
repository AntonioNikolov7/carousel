import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
  type TouchEvent,
} from "react";

/*
 * ──────────────────────────────────────────────
 *  TYPES
 * ──────────────────────────────────────────────
 */
interface CarouselImage {
  id: string | number;
  src: string;
  width: number;
  height: number;
  alt?: string;
}

interface InfiniteCarouselProps {
  images: CarouselImage[];
  height?: number;
  gap?: number;
}

interface VisibleItem {
  key: string;
  index: number;
  x: number;
  width: number;
}

interface TouchRecord {
  x: number;
  y?: number;
  time: number;
}

/*
 * ──────────────────────────────────────────────
 *  CONFIG
 * ──────────────────────────────────────────────
 */
const DEFAULT_HEIGHT: number = 300;
const DEFAULT_GAP: number = 16;
const FRICTION: number = 0.95;
const MIN_VELOCITY: number = 0.5;
const SNAP_SPEED: number = 0.12;
const RENDER_BUFFER_PX: number = 600;
const PREFETCH_AHEAD: number = 5;
const PREFETCH_BEHIND: number = 2;
const PICSUM_API: string = "https://picsum.photos/v2/list";

/*
 * ──────────────────────────────────────────────
 *  InfiniteCarousel (reusable)
 * ──────────────────────────────────────────────
 */
function InfiniteCarousel({
  images = [],
  height = DEFAULT_HEIGHT,
  gap = DEFAULT_GAP,
}: InfiniteCarouselProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollOffset = useRef<number>(0);
  const velocity = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const isSnapping = useRef<boolean>(false);
  const touchStart = useRef<TouchRecord>({ x: 0, y: 0, time: 0 });
  const touchLast = useRef<TouchRecord>({ x: 0, time: 0 });
  const isDragging = useRef<boolean>(false);
  const hasDraggedSignificantly = useRef<boolean>(false);
  const hasInitialized = useRef<boolean>(false);
  const prefetchedUrls = useRef<Set<string>>(new Set());
  const [, forceRender] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  /* ── item geometry ── */
  const itemWidths: number[] = useMemo(
    () => images.map((img) => Math.round(height * (img.width / img.height))),
    [images, height]
  );

  const prefixSums: Float64Array = useMemo(() => {
    const sums = new Float64Array(itemWidths.length + 1);
    for (let i = 0; i < itemWidths.length; i++) {
      sums[i + 1] = sums[i] + itemWidths[i] + gap;
    }
    return sums;
  }, [itemWidths, gap]);

  const cycleLength: number = prefixSums[prefixSums.length - 1] || 1;

  /* ── normalize offset into [0, cycleLength) ── */
  const normalize = useCallback(
    (val: number): number => ((val % cycleLength) + cycleLength) % cycleLength,
    [cycleLength]
  );

  /* ── binary search: first item whose right edge > offset ── */
  const findFirstVisible = useCallback(
    (offset: number): number => {
      let lo = 0;
      let hi = images.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (prefixSums[mid + 1] <= offset) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
    [images.length, prefixSums]
  );

  /* ── compute visible items across the cycle boundary ── */
  const getVisibleItems = useCallback((): VisibleItem[] => {
    if (!images.length) return [];
    const n = images.length;
    const offset = normalize(scrollOffset.current);
    const windowStart = offset - RENDER_BUFFER_PX;
    const windowEnd = offset + viewportWidth + RENDER_BUFFER_PX;

    const items: VisibleItem[] = [];
    const startCycle = Math.floor(windowStart / cycleLength);
    const endCycle = Math.floor(windowEnd / cycleLength);

    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
      const cycleStart = cycle * cycleLength;
      const localStart = Math.max(0, windowStart - cycleStart);
      const localEnd = Math.min(cycleLength, windowEnd - cycleStart);

      if (localEnd <= 0 || localStart >= cycleLength) continue;

      let idx = findFirstVisible(localStart);
      while (idx < n && prefixSums[idx] < localEnd) {
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
  }, [
    images.length,
    normalize,
    cycleLength,
    viewportWidth,
    findFirstVisible,
    prefixSums,
    itemWidths,
  ]);

  /* ── predictive prefetch: preload images ahead of scroll direction ── */
  const prefetchAround = useCallback(
    (visibleItems: VisibleItem[]): void => {
      if (!images.length) return;
      const n = images.length;

      let minIdx = Infinity;
      let maxIdx = -Infinity;
      for (const item of visibleItems) {
        if (item.index < minIdx) minIdx = item.index;
        if (item.index > maxIdx) maxIdx = item.index;
      }
      if (minIdx === Infinity) return;

      const dir = velocity.current >= 0 ? 1 : -1;
      const ahead = dir === 1 ? PREFETCH_AHEAD : PREFETCH_BEHIND;
      const behind = dir === 1 ? PREFETCH_BEHIND : PREFETCH_AHEAD;

      const toPrefetch: number[] = [];
      for (let i = 1; i <= ahead; i++) {
        toPrefetch.push((((maxIdx + i) % n) + n) % n);
      }
      for (let i = 1; i <= behind; i++) {
        toPrefetch.push((((minIdx - i) % n) + n) % n);
      }

      for (const idx of toPrefetch) {
        const url = images[idx].src;
        if (!prefetchedUrls.current.has(url)) {
          prefetchedUrls.current.add(url);
          const img = new Image();
          img.src = url;
        }
      }
    },
    [images]
  );

  /* ── snap to nearest item center ── */
  const getSnapTarget = useCallback((): number => {
    const offset = normalize(scrollOffset.current);
    const center = offset + viewportWidth / 2;
    let best = 0;
    let bestDist = Infinity;

    for (let i = 0; i < images.length; i++) {
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
    const currentCycle = Math.round(scrollOffset.current / cycleLength);
    target += currentCycle * cycleLength;
    if (Math.abs(target - scrollOffset.current) > cycleLength / 2) {
      target += target < scrollOffset.current ? cycleLength : -cycleLength;
    }
    return target;
  }, [normalize, viewportWidth, images.length, prefixSums, itemWidths, cycleLength]);

  /* ── animation loop ── */
  const tick = useCallback((): void => {
    if (isDragging.current) {
      rafId.current = requestAnimationFrame(tick);
      return;
    }

    let needsRender = false;

    if (isSnapping.current) {
      const target = getSnapTarget();
      const diff = target - scrollOffset.current;
      if (Math.abs(diff) < 0.5) {
        scrollOffset.current = target;
        isSnapping.current = false;
        needsRender = true;
      } else {
        scrollOffset.current += diff * SNAP_SPEED;
        needsRender = true;
      }
    } else if (Math.abs(velocity.current) > MIN_VELOCITY) {
      scrollOffset.current += velocity.current;
      velocity.current *= FRICTION;
      needsRender = true;
    } else if (velocity.current !== 0) {
      velocity.current = 0;
      isSnapping.current = true;
      needsRender = true;
    }

    if (needsRender) {
      forceRender((n) => n + 1);
      rafId.current = requestAnimationFrame(tick);
    } else {
      rafId.current = null;
    }
  }, [getSnapTarget, prefetchAround]);

  const ensureAnimating = useCallback((): void => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  /* ── wheel handler ── */
  const handleWheel = useCallback(
    (e: WheelEvent): void => {
      e.preventDefault();
      isSnapping.current = false;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      velocity.current += delta * 0.5;
      ensureAnimating();
    },
    [ensureAnimating]
  );

  /* ── touch handlers ── */
  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>): void => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    touchLast.current = { x: t.clientX, time: Date.now() };
    isDragging.current = true;
    hasDraggedSignificantly.current = false;
    velocity.current = 0;
    isSnapping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>): void => {
    if (!isDragging.current) return;
    const t = e.touches[0];
    const dx = touchLast.current.x - t.clientX;

    if (
      !hasDraggedSignificantly.current &&
      Math.abs(t.clientX - touchStart.current.x) > 10
    ) {
      hasDraggedSignificantly.current = true;
    }

    if (hasDraggedSignificantly.current) {
      e.preventDefault();
    }

    scrollOffset.current += dx;
    touchLast.current = { x: t.clientX, time: Date.now() };
    forceRender((n) => n + 1);
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>): void => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const dt = Date.now() - touchLast.current.time;
      if (dt < 100) {
        const lastTouch = e.changedTouches[0];
        const dx = touchLast.current.x - lastTouch.clientX;
        velocity.current = (dx / Math.max(dt, 1)) * 16;
      } else {
        isSnapping.current = true;
      }
      ensureAnimating();
    },
    [ensureAnimating]
  );

  /* ── resize observer ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]: ResizeObserverEntry[]) => {
      setViewportWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── attach non-passive wheel listener ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  /* ── cleanup ── */
  useEffect(
    () => () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    },
    []
  );

  /* ── initialize offset deep inside the cycle space ── */
  useEffect(() => {
    if (images.length && cycleLength > 1 && !hasInitialized.current) {
      hasInitialized.current = true;
      scrollOffset.current = cycleLength * 1000;
      forceRender((n) => n + 1);
    }
  }, [images.length, cycleLength]);

  /* ── render ── */
  const visibleItems = getVisibleItems();

  // Prefetch images beyond the visible + buffer zone
  prefetchAround(visibleItems);

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: height + 40,
    overflow: "hidden",
    cursor: "default",
    userSelect: "none",
    touchAction: "pan-y",
  };

  const edgeFadeLeft: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: 60,
    height: "100%",
    background: "linear-gradient(to right, rgba(17,17,17,0.7), transparent)",
    pointerEvents: "none",
    zIndex: 2,
  };

  const edgeFadeRight: CSSProperties = {
    position: "absolute",
    right: 0,
    top: 0,
    width: 60,
    height: "100%",
    background: "linear-gradient(to left, rgba(17,17,17,0.7), transparent)",
    pointerEvents: "none",
    zIndex: 2,
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={containerStyle}
    >
      {visibleItems.map(({ key, index, x, width: w }: VisibleItem) => {
        const itemStyle: CSSProperties = {
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height,
          transform: `translate3d(${x}px, 0, 0)`,
          willChange: "transform",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          background: "#2a2a2a",
        };

        const imgStyle: CSSProperties = {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          pointerEvents: "none",
        };

        return (
          <div key={key} style={itemStyle}>
            <img
              src={images[index].src}
              alt={images[index].alt || `Image ${images[index].id}`}
              draggable={false}
              style={imgStyle}
            />
          </div>
        );
      })}

      <div style={edgeFadeLeft} />
      <div style={edgeFadeRight} />
    </div>
  );
}

/*
 * ──────────────────────────────────────────────
 *  Picsum API response type
 * ──────────────────────────────────────────────
 */
interface PicsumImage {
  id: string;
  author: string;
  width: number;
  height: number;
  url: string;
  download_url: string;
}

/*
 * ──────────────────────────────────────────────
 *  Demo App — fetches from Picsum & renders
 * ──────────────────────────────────────────────
 */
export default function App(): React.JSX.Element {
  const [images, setImages] = useState<CarouselImage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [count, setCount] = useState<number>(30);

  useEffect(() => {
    setLoading(true);
    const pages = Math.ceil(count / 30);
    const fetches: Promise<PicsumImage[]>[] = Array.from(
      { length: pages },
      (_, i) =>
        fetch(`${PICSUM_API}?page=${i + 1}&limit=30`).then(
          (r) => r.json() as Promise<PicsumImage[]>
        )
    );

    Promise.all(fetches)
      .then((results) => {
        const all = results.flat().slice(0, count);
        setImages(
          all.map(
            (img): CarouselImage => ({
              id: img.id,
              src: `https://picsum.photos/id/${img.id}/${Math.min(img.width, 800)}/${Math.min(img.height, 600)}`,
              width: img.width,
              height: img.height,
              alt: `Photo by ${img.author}`,
            })
          )
        );
      })
      .finally(() => setLoading(false));
  }, [count]);

  const countOptions: number[] = [12, 30, 100];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111",
        color: "#fff",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 0",
      }}
    >
      <h1
        style={{
          fontSize: "clamp(1.4rem, 4vw, 2.2rem)",
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        Infinite Carousel
      </h1>
      <p style={{ color: "#888", marginBottom: 24, fontSize: 14 }}>
        Scroll to navigate &middot; {images.length} images loaded
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        {countOptions.map((n) => (
          <button
            key={n}
            onClick={() => setCount(n)}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              border: "1px solid",
              borderColor: count === n ? "#fff" : "#444",
              background: count === n ? "#fff" : "transparent",
              color: count === n ? "#111" : "#aaa",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            {n} images
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, color: "#666" }}>Loading images...</div>
      ) : (
        <InfiniteCarousel images={images} height={300} gap={16} />
      )}

      <p
        style={{
          color: "#555",
          marginTop: 40,
          fontSize: 12,
          textAlign: "center",
          maxWidth: 500,
          lineHeight: 1.6,
          padding: "0 20px",
        }}
      >
        Virtualized rendering — only visible items are in the DOM.
        <br />
        Works with mouse wheel, trackpad, and touch swipe.
      </p>
    </div>
  );
}
