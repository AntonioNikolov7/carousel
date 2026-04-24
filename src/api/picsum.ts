import type { CarouselImage } from "../components/InfiniteCarousel";

interface PicsumImage {
  id: string;
  author: string;
  width: number;
  height: number;
  url: string;
  download_url: string;
}

const PICSUM_API = import.meta.env.VITE_PICSUM_API_URL;
if (!PICSUM_API) {
  throw new Error("Missing VITE_PICSUM_API_URL in environment");
}

const PAGE_SIZE = 30;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

const cache = new Map<number, Promise<CarouselImage[]>>();

export function fetchPicsumImages(count: number): Promise<CarouselImage[]> {
  let pending = cache.get(count);
  if (!pending) {
    pending = fetchFromApi(count).catch((err) => {
      cache.delete(count);
      throw err;
    });
    cache.set(count, pending);
  }
  return pending;
}

async function fetchFromApi(count: number): Promise<CarouselImage[]> {
  const pages = Math.ceil(count / PAGE_SIZE);
  const fetches: Promise<PicsumImage[]>[] = Array.from(
    { length: pages },
    (_, i) =>
      fetch(`${PICSUM_API}?page=${i + 1}&limit=${PAGE_SIZE}`).then(
        (r) => r.json() as Promise<PicsumImage[]>
      )
  );

  const results = await Promise.all(fetches);
  const all = results.flat().slice(0, count);

  return all.map(
    (img): CarouselImage => ({
      id: img.id,
      src: `https://picsum.photos/id/${img.id}/${Math.min(img.width, MAX_WIDTH)}/${Math.min(img.height, MAX_HEIGHT)}`,
      width: img.width,
      height: img.height,
      alt: `Photo by ${img.author}`,
    })
  );
}
