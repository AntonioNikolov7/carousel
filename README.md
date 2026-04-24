# Infinite Carousel

A virtualized, infinitely-scrolling image carousel for React. Only the images currently on screen (plus a small buffer) are in the DOM. Works with mouse wheel, trackpad, and touch swipe.

Built with React 19, TypeScript, and Vite.

## Features

- **Virtualized rendering** — renders only what's visible, scales to hundreds of images
- **Infinite scroll** via cycle-space math (no array duplication)
- **Momentum + snap** — flick-to-coast with friction and centered snap
- **Predictive prefetch** — preloads images ahead of scroll direction
- **Reusable component** — fully prop-configurable, no inline styles
- **Request caching** — same-query refetches are instant

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the built `dist/` |
| `npm run lint` | Run ESLint |

## Environment variables

Defined in [.env](.env) (gitignored). Template lives in [.env.example](.env.example).


## Project structure

```
src/
├── api/picsum.ts                         — data layer + request cache
├── components/InfiniteCarousel/
│   ├── InfiniteCarousel.tsx              — presentation
│   ├── InfiniteCarousel.hooks.ts         — state, RAF loop, handlers
│   ├── InfiniteCarousel.utils.ts         — pure helpers (geometry, snap, prefetch)
│   ├── InfiniteCarousel.types.ts
│   ├── InfiniteCarousel.constants.ts
│   ├── InfiniteCarousel.css
│   └── index.ts                          — public barrel
├── App.tsx / App.css                     — demo host
├── main.tsx                              — React mount
└── vite-env.d.ts                         — typed env vars
```


## How it works (short version)

- Each image is scaled to the target `height`; **prefix sums** of widths give O(1) item positions.
- A single `scrollOffset` number drives everything; normalizing into `[0, cycleLength)` lets the same image reappear on either end without array duplication.
- **Binary search** (`findFirstVisible`) picks the first on-screen item; we walk forward from there to build the visible window.
- A **RAF loop** integrates velocity with friction; when velocity decays, snap takes over and eases the nearest item center to the viewport center.
- `useLayoutEffect` synchronizes visible items and scroll position with new image sets **before paint** to prevent flashes.
- API calls are cached by key (`Map<count, Promise>`), dedupes in-flight requests, and invalidates cached rejections so retries work.

