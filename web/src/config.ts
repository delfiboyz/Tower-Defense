export const TILE = 64;
export const COLS = 20;
export const ROWS = 11;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export const START_GOLD = 220;
export const START_LIVES = 20;
export const MAX_WAVES = 20;
export const SELL_REFUND = 0.7;

export type SpriteId =
  | 'tower_1' | 'tower_2' | 'tower_3' | 'tower_plate' | 'tile_grass'
  | 'enemy_1' | 'enemy_2' | 'bullet_1' | 'bullet_2';

export type TowerId = 'blaster' | 'sniper' | 'rocket' | 'frost';
export type EnemyId = 'scout' | 'tank' | 'swarm' | 'boss';
export type TargetMode = 'first' | 'last' | 'strong' | 'close';

export const TARGET_MODES: TargetMode[] = ['first', 'last', 'strong', 'close'];
export const TARGET_LABELS: Record<TargetMode, string> = {
  first: 'Terdepan',
  last: 'Terbelakang',
  strong: 'Terkuat',
  close: 'Terdekat',
};

export interface TowerLevel {
  cost: number;
  damage: number;
  /** Range in tiles. */
  range: number;
  /** Shots per second. */
  fireRate: number;
  /** Projectile speed in tiles per second. */
  projectileSpeed: number;
  /** Splash radius in tiles, 0 = single target. */
  splash: number;
  /** Speed multiplier applied to hit enemies (frost). */
  slow?: number;
  slowDuration?: number;
}

export interface TowerDef {
  id: TowerId;
  name: string;
  description: string;
  hotkey: string;
  sprite: SpriteId;
  bullet: SpriteId;
  tint?: string;
  armorPierce?: boolean;
  levels: TowerLevel[];
}

export const TOWERS: Record<TowerId, TowerDef> = {
  blaster: {
    id: 'blaster',
    name: 'Blaster',
    description: 'Tembakan cepat, target tunggal.',
    hotkey: '1',
    sprite: 'tower_1',
    bullet: 'bullet_1',
    levels: [
      { cost: 50, damage: 5, range: 2.8, fireRate: 2, projectileSpeed: 9, splash: 0 },
      { cost: 45, damage: 8, range: 3, fireRate: 2.5, projectileSpeed: 10, splash: 0 },
      { cost: 90, damage: 14, range: 3.3, fireRate: 3.2, projectileSpeed: 11, splash: 0 },
    ],
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    description: 'Memperlambat musuh di area kecil.',
    hotkey: '2',
    sprite: 'tower_1',
    bullet: 'bullet_1',
    tint: '#4fc3ff',
    levels: [
      { cost: 70, damage: 2, range: 2.4, fireRate: 1.2, projectileSpeed: 8, splash: 0.8, slow: 0.55, slowDuration: 1.6 },
      { cost: 60, damage: 3, range: 2.7, fireRate: 1.4, projectileSpeed: 9, splash: 0.95, slow: 0.45, slowDuration: 1.9 },
      { cost: 110, damage: 5, range: 3, fireRate: 1.6, projectileSpeed: 10, splash: 1.1, slow: 0.35, slowDuration: 2.2 },
    ],
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    description: 'Jangkauan jauh, menembus armor.',
    hotkey: '3',
    sprite: 'tower_2',
    bullet: 'bullet_1',
    armorPierce: true,
    levels: [
      { cost: 110, damage: 20, range: 4, fireRate: 0.6, projectileSpeed: 18, splash: 0 },
      { cost: 100, damage: 36, range: 4.5, fireRate: 0.7, projectileSpeed: 20, splash: 0 },
      { cost: 180, damage: 68, range: 5, fireRate: 0.8, projectileSpeed: 22, splash: 0 },
    ],
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket',
    description: 'Roket dengan ledakan area.',
    hotkey: '4',
    sprite: 'tower_3',
    bullet: 'bullet_2',
    levels: [
      { cost: 125, damage: 16, range: 3.2, fireRate: 0.6, projectileSpeed: 7, splash: 1.1 },
      { cost: 110, damage: 28, range: 3.4, fireRate: 0.7, projectileSpeed: 7.5, splash: 1.3 },
      { cost: 200, damage: 48, range: 3.7, fireRate: 0.8, projectileSpeed: 8, splash: 1.5 },
    ],
  },
};

export const TOWER_ORDER: TowerId[] = ['blaster', 'frost', 'sniper', 'rocket'];

export interface EnemyDef {
  id: EnemyId;
  name: string;
  sprite: SpriteId;
  tint?: string;
  hp: number;
  /** Tiles per second. */
  speed: number;
  reward: number;
  armor: number;
  /** Rendered size in tiles. */
  size: number;
  livesCost: number;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  scout: { id: 'scout', name: 'Scout', sprite: 'enemy_1', hp: 14, speed: 2.1, reward: 6, armor: 0, size: 0.55, livesCost: 1 },
  swarm: { id: 'swarm', name: 'Swarm', sprite: 'enemy_1', tint: '#b36bff', hp: 6, speed: 2.8, reward: 3, armor: 0, size: 0.42, livesCost: 1 },
  tank: { id: 'tank', name: 'Tank', sprite: 'enemy_2', hp: 48, speed: 1.1, reward: 14, armor: 3, size: 0.8, livesCost: 2 },
  boss: { id: 'boss', name: 'Boss', sprite: 'enemy_2', tint: '#ff4d4d', hp: 420, speed: 0.75, reward: 120, armor: 5, size: 1.15, livesCost: 8 },
};

export interface WaveSpawn {
  type: EnemyId;
  /** Seconds to wait before this spawn. */
  delay: number;
}

/** HP multiplier for a given wave number (1-based). */
export function waveHpScale(wave: number): number {
  const n = wave - 1;
  return 1 + 0.17 * n + 0.012 * n * n;
}

export function buildWave(wave: number): WaveSpawn[] {
  const spawns: WaveSpawn[] = [];
  const push = (type: EnemyId, count: number, gap: number) => {
    for (let i = 0; i < count; i++) spawns.push({ type, delay: gap });
  };
  push('scout', 5 + Math.floor(wave * 1.5), Math.max(0.4, 0.85 - wave * 0.02));
  if (wave >= 3) push('tank', Math.floor((wave - 1) / 2), 1.5);
  if (wave >= 4 && wave % 2 === 0) push('swarm', 6 + wave, 0.28);
  if (wave % 5 === 0) push('boss', wave / 5, 3);
  spawns[0].delay = 0.5;
  return spawns;
}

export function waveSummary(wave: number): Partial<Record<EnemyId, number>> {
  const summary: Partial<Record<EnemyId, number>> = {};
  for (const s of buildWave(wave)) summary[s.type] = (summary[s.type] ?? 0) + 1;
  return summary;
}
