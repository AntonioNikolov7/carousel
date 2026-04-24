import type { CSSProperties } from "react";
import type { InfiniteCarouselProps } from "./InfiniteCarousel.types";
import { useInfiniteCarousel } from "./InfiniteCarousel.hooks";
import {
  DEFAULT_FRICTION,
  DEFAULT_GAP,
  DEFAULT_HEIGHT,
  DEFAULT_MIN_VELOCITY,
  DEFAULT_PREFETCH_AHEAD,
  DEFAULT_PREFETCH_BEHIND,
  DEFAULT_RENDER_BUFFER_PX,
  DEFAULT_SNAP_SPEED,
} from "./InfiniteCarousel.constants";
import "./InfiniteCarousel.css";

export function InfiniteCarousel({
  images,
  height = DEFAULT_HEIGHT,
  gap = DEFAULT_GAP,
  friction = DEFAULT_FRICTION,
  minVelocity = DEFAULT_MIN_VELOCITY,
  snapSpeed = DEFAULT_SNAP_SPEED,
  renderBufferPx = DEFAULT_RENDER_BUFFER_PX,
  prefetchAhead = DEFAULT_PREFETCH_AHEAD,
  prefetchBehind = DEFAULT_PREFETCH_BEHIND,
  enableSnap = true,
  enableEdgeFade = true,
  className,
  renderItem,
  onIndexChange,
}: InfiniteCarouselProps) {
  const { containerRef, visibleItems, touchHandlers } = useInfiniteCarousel({
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
  });

  const rootStyle: CSSProperties = { height: height + 40 };
  const rootClassName = className
    ? `carousel-root ${className}`
    : "carousel-root";

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      style={rootStyle}
      {...touchHandlers}
    >
      {visibleItems.map(({ key, index, x, width }) => {
        const image = images[index];
        if (!image) return null;
        const itemStyle: CSSProperties = {
          width,
          height,
          transform: `translate3d(${x}px, 0, 0)`,
        };
        return (
          <div key={key} className="carousel-item" style={itemStyle}>
            {renderItem ? (
              renderItem(image, index)
            ) : (
              <img
                className="carousel-item-img"
                src={image.src}
                alt={image.alt || `Image ${image.id}`}
                draggable={false}
              />
            )}
          </div>
        );
      })}

      {enableEdgeFade && (
        <>
          <div className="carousel-fade carousel-fade-left" />
          <div className="carousel-fade carousel-fade-right" />
        </>
      )}
    </div>
  );
}
