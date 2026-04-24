import type { ReactNode } from "react";

export interface CarouselImage {
  id: string | number;
  src: string;
  width: number;
  height: number;
  alt?: string;
}

export interface VisibleItem {
  key: string;
  index: number;
  x: number;
  width: number;
}

export interface TouchRecord {
  x: number;
  y?: number;
  time: number;
}

export interface InfiniteCarouselProps {
  images: CarouselImage[];
  height?: number;
  gap?: number;
  friction?: number;
  minVelocity?: number;
  snapSpeed?: number;
  renderBufferPx?: number;
  prefetchAhead?: number;
  prefetchBehind?: number;
  enableSnap?: boolean;
  enableEdgeFade?: boolean;
  className?: string;
  renderItem?: (image: CarouselImage, index: number) => ReactNode;
  onIndexChange?: (index: number) => void;
}
