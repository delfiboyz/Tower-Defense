import type { SpriteId } from './config';

const SPRITES: SpriteId[] = [
  'tower_1', 'tower_2', 'tower_3', 'tower_plate', 'tile_grass',
  'enemy_1', 'enemy_2', 'bullet_1', 'bullet_2',
];

export type Sprites = Record<SpriteId, HTMLImageElement>;

export async function loadSprites(): Promise<Sprites> {
  const entries = await Promise.all(
    SPRITES.map(async (id) => {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}assets/sprites/${id}.png`;
      await img.decode();
      return [id, img] as const;
    }),
  );
  return Object.fromEntries(entries) as Sprites;
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** Returns a copy of `img` recoloured towards `color`, keeping its shading. */
export function tinted(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const key = `${img.src}|${color}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  tintCache.set(key, canvas);
  return canvas;
}
