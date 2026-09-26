const base = import.meta.env.BASE_URL;

export const assetUrls = {
  ships: `${base}assets/ships/ship-atlas.png`,
  water: `${base}assets/terrain/water-mirror-tile.jpg`,
  grass: `${base}assets/terrain/grass-mirror-tile.jpg`,
  sand: `${base}assets/terrain/sand-mirror-tile.jpg`,
  effects: `${base}assets/effects/combat-effects.png`,
  icons: `${base}assets/icons/ui-icons.png`,
  oceanRipples: `${base}assets/overlays/ocean-ripples.png`,
  shoreFoam: `${base}assets/overlays/shore-foam.png`,
  fogMist: `${base}assets/overlays/fog-mist.png`,
} as const;

const cache = new Map<string, HTMLImageElement>();

export function loadRenderImage(url: string, onReady: () => void): HTMLImageElement {
  const existing = cache.get(url);
  if (existing) return existing;
  const image = new Image();
  image.decoding = "async";
  image.addEventListener("load", onReady, { once: true });
  image.src = url;
  cache.set(url, image);
  return image;
}
