import { useEffect, useState } from "react";
import {
  InfiniteCarousel,
  type CarouselImage,
} from "./components/InfiniteCarousel";
import { fetchPicsumImages } from "./api/picsum";
import "./App.css";

const COUNT_OPTIONS = [10, 50, 500];

export default function App() {
  const [images, setImages] = useState<CarouselImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(50);

  useEffect(() => {
    let cancelled = false;
    fetchPicsumImages(count).then((imgs) => {
      if (cancelled) return;
      setImages(imgs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [count]);

  const handleCountChange = (n: number) => {
    setLoading(true);
    setCount(n);
  };

  return (
    <div className="app-root">
      <h1 className="app-title">Infinite Carousel</h1>
      <p className="app-subtitle">
        Scroll to navigate &middot; {images.length} images loaded
      </p>

      <div className="app-count-group">
        {COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => handleCountChange(n)}
            className={
              count === n ? "app-count-btn is-active" : "app-count-btn"
            }
          >
            {n} images
          </button>
        ))}
      </div>

      <div className="app-carousel-wrap">
        {images.length > 0 && (
          <InfiniteCarousel images={images} height={300} gap={16} />
        )}
        {loading && (
          <div className="app-carousel-loader" role="status" aria-live="polite">
            <span className="app-carousel-loader-dot" />
            <span className="app-carousel-loader-dot" />
            <span className="app-carousel-loader-dot" />
          </div>
        )}
      </div>

      <p className="app-footer">
        Virtualized rendering — only visible items are in the DOM.
        <br />
        Works with mouse wheel, trackpad, and touch swipe.
      </p>
    </div>
  );
}
