import {
  ENEMIES, MAX_WAVES, SELL_REFUND, START_GOLD, START_LIVES, TARGET_MODES, TILE, TOWERS,
  buildWave, waveHpScale,
  type EnemyDef, type EnemyId, type TargetMode, type TowerDef, type TowerId, type TowerLevel, type WaveSpawn,
} from './config';
import { Path } from './path';

export interface Enemy {
  id: number;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  /** Pixels travelled along the path. */
  progress: number;
  x: number;
  y: number;
  angle: number;
  slowFactor: number;
  slowTimer: number;
  hitFlash: number;
}

export interface Tower {
  id: number;
  def: TowerDef;
  level: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  angle: number;
  cooldown: number;
  target: TargetMode;
  invested: number;
  kills: number;
  recoil: number;
}

export interface Projectile {
  tower: Tower;
  stats: TowerLevel;
  target: Enemy | null;
  x: number;
  y: number;
  tx: number;
  ty: number;
  angle: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export type GameEvent =
  | { type: 'shoot'; tower: Tower }
  | { type: 'hit'; x: number; y: number; damage: number; enemy: Enemy }
  | { type: 'explode'; x: number; y: number; radius: number; frost: boolean }
  | { type: 'kill'; enemy: Enemy; reward: number }
  | { type: 'leak'; enemy: Enemy }
  | { type: 'build' | 'upgrade' | 'sell'; tower: Tower }
  | { type: 'waveStart'; wave: number; early: number }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'gameOver'; win: boolean };

const TURN_SPEED = 10; // radians per second
const AIM_TOLERANCE = 0.3;

export class Game {
  readonly path = new Path();
  gold = START_GOLD;
  lives = START_LIVES;
  wave = 0;
  score = 0;
  kills = 0;
  status: GameStatus = 'playing';
  endless = false;
  autoWave = false;
  /** Seconds until the next wave auto-starts (when autoWave is on). */
  autoTimer = 0;
  time = 0;

  towers: Tower[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];

  private queue: WaveSpawn[] = [];
  private spawnTimer = 0;
  private nextId = 1;
  private lastCleared = 0;
  private listeners: ((e: GameEvent) => void)[] = [];

  on(listener: (e: GameEvent) => void): void {
    this.listeners.push(listener);
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  get waveInProgress(): boolean {
    return this.queue.length > 0 || this.enemies.length > 0;
  }

  // ── Building ────────────────────────────────────────────────────────────

  towerAt(tx: number, ty: number): Tower | undefined {
    return this.towers.find((t) => t.tx === tx && t.ty === ty);
  }

  canPlace(tx: number, ty: number): boolean {
    return this.path.isInside(tx, ty) && !this.path.isPathCell(tx, ty) && !this.towerAt(tx, ty);
  }

  placeTower(id: TowerId, tx: number, ty: number): Tower | null {
    const def = TOWERS[id];
    const cost = def.levels[0].cost;
    if (this.status !== 'playing' || !this.canPlace(tx, ty) || this.gold < cost) return null;
    this.gold -= cost;
    const tower: Tower = {
      id: this.nextId++, def, level: 0, tx, ty,
      x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
      angle: -Math.PI / 2, cooldown: 0, target: 'first', invested: cost, kills: 0, recoil: 0,
    };
    this.towers.push(tower);
    this.emit({ type: 'build', tower });
    return tower;
  }

  upgradeCost(tower: Tower): number | null {
    const next = tower.def.levels[tower.level + 1];
    return next ? next.cost : null;
  }

  upgradeTower(tower: Tower): boolean {
    const cost = this.upgradeCost(tower);
    if (cost === null || this.gold < cost || this.status !== 'playing') return false;
    this.gold -= cost;
    tower.level++;
    tower.invested += cost;
    this.emit({ type: 'upgrade', tower });
    return true;
  }

  sellValue(tower: Tower): number {
    return Math.floor(tower.invested * SELL_REFUND);
  }

  sellTower(tower: Tower): void {
    const idx = this.towers.indexOf(tower);
    if (idx < 0 || this.status !== 'playing') return;
    this.towers.splice(idx, 1);
    this.gold += this.sellValue(tower);
    for (const p of this.projectiles) if (p.tower === tower) p.target = null;
    this.emit({ type: 'sell', tower });
  }

  cycleTargetMode(tower: Tower): void {
    const i = TARGET_MODES.indexOf(tower.target);
    tower.target = TARGET_MODES[(i + 1) % TARGET_MODES.length];
  }

  // ── Waves ───────────────────────────────────────────────────────────────

  /** Starts the next wave. Calling it while a wave is running grants an early-call bonus. */
  startNextWave(): boolean {
    if (this.status !== 'playing') return false;
    if (!this.endless && this.wave >= MAX_WAVES) return false;
    const early = this.waveInProgress ? 10 + this.wave * 3 : 0;
    this.wave++;
    this.gold += early;
    const spawns = buildWave(this.wave);
    if (this.queue.length === 0) this.spawnTimer = spawns[0].delay;
    this.queue.push(...spawns);
    this.autoTimer = 0;
    this.emit({ type: 'waveStart', wave: this.wave, early });
    return true;
  }

  private spawn(type: EnemyId): void {
    const def = ENEMIES[type];
    const hp = Math.round(def.hp * waveHpScale(this.wave));
    const start = this.path.sample(0);
    this.enemies.push({
      id: this.nextId++, def, hp, maxHp: hp, progress: 0,
      x: start.x, y: start.y, angle: start.angle, slowFactor: 1, slowTimer: 0, hitFlash: 0,
    });
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  update(dt: number): void {
    if (this.status !== 'playing') return;
    this.time += dt;
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.checkWaveState(dt);
  }

  private updateSpawns(dt: number): void {
    if (this.queue.length === 0) return;
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.queue.length > 0) {
      this.spawn(this.queue.shift()!.type);
      if (this.queue.length > 0) this.spawnTimer += this.queue[0].delay;
    }
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.progress += e.def.speed * e.slowFactor * TILE * dt;
      if (e.progress >= this.path.length) {
        this.enemies.splice(i, 1);
        this.lives = Math.max(0, this.lives - e.def.livesCost);
        this.emit({ type: 'leak', enemy: e });
        if (this.lives <= 0) {
          this.status = 'lost';
          this.emit({ type: 'gameOver', win: false });
          return;
        }
        continue;
      }
      const s = this.path.sample(e.progress);
      e.x = s.x;
      e.y = s.y;
      e.angle = s.angle;
    }
  }

  findTarget(tower: Tower): Enemy | null {
    const range = tower.def.levels[tower.level].range * TILE;
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (d > range) continue;
      let score: number;
      switch (tower.target) {
        case 'first': score = e.progress; break;
        case 'last': score = -e.progress; break;
        case 'strong': score = e.hp; break;
        case 'close': score = -d; break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      t.cooldown -= dt;
      t.recoil = Math.max(0, t.recoil - dt * 6);
      const target = this.findTarget(t);
      if (!target) continue;
      const desired = Math.atan2(target.y - t.y, target.x - t.x);
      const diff = normalizeAngle(desired - t.angle);
      const step = TURN_SPEED * dt;
      t.angle = normalizeAngle(t.angle + Math.max(-step, Math.min(step, diff)));
      if (t.cooldown <= 0 && Math.abs(normalizeAngle(desired - t.angle)) < AIM_TOLERANCE) {
        const stats = t.def.levels[t.level];
        t.cooldown = 1 / stats.fireRate;
        t.recoil = 1;
        const muzzle = TILE * 0.35;
        this.projectiles.push({
          tower: t, stats, target,
          x: t.x + Math.cos(t.angle) * muzzle, y: t.y + Math.sin(t.angle) * muzzle,
          tx: target.x, ty: target.y, angle: t.angle,
        });
        this.emit({ type: 'shoot', tower: t });
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.target && !this.enemies.includes(p.target)) p.target = null;
      if (p.target) {
        p.tx = p.target.x;
        p.ty = p.target.y;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.stats.projectileSpeed * TILE * dt;
      p.angle = Math.atan2(dy, dx);
      if (dist <= step + 4) {
        this.projectiles.splice(i, 1);
        this.impact(p);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  private impact(p: Projectile): void {
    const { stats } = p;
    if (stats.splash > 0) {
      const radius = stats.splash * TILE;
      this.emit({ type: 'explode', x: p.tx, y: p.ty, radius, frost: !!stats.slow });
      for (const e of [...this.enemies]) {
        if (Math.hypot(e.x - p.tx, e.y - p.ty) <= radius) this.damage(e, p);
      }
    } else if (p.target) {
      this.damage(p.target, p);
    }
  }

  private damage(e: Enemy, p: Projectile): void {
    const { stats, tower } = p;
    const dealt = tower.def.armorPierce ? stats.damage : Math.max(1, stats.damage - e.def.armor);
    e.hp -= dealt;
    e.hitFlash = 0.08;
    if (stats.slow && stats.slowDuration) {
      e.slowFactor = Math.min(e.slowFactor, stats.slow);
      e.slowTimer = Math.max(e.slowTimer, stats.slowDuration);
    }
    this.emit({ type: 'hit', x: e.x, y: e.y, damage: dealt, enemy: e });
    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx < 0) return;
      this.enemies.splice(idx, 1);
      this.gold += e.def.reward;
      this.score += e.def.reward * 10;
      this.kills++;
      tower.kills++;
      this.emit({ type: 'kill', enemy: e, reward: e.def.reward });
    }
  }

  private checkWaveState(dt: number): void {
    if (this.status !== 'playing' || this.wave === 0) return;
    if (!this.waveInProgress && this.autoTimer <= 0 && this.lastCleared < this.wave) {
      const bonus = 20 + this.wave * 5;
      this.gold += bonus;
      this.score += bonus * 5 + this.lives * 10;
      this.lastCleared = this.wave;
      this.emit({ type: 'waveCleared', wave: this.wave, bonus });
      if (!this.endless && this.wave >= MAX_WAVES) {
        this.status = 'won';
        this.emit({ type: 'gameOver', win: true });
        return;
      }
      if (this.autoWave) this.autoTimer = 4;
    }
    if (this.autoTimer > 0) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) this.startNextWave();
    }
  }

  /** Continue playing after winning. */
  continueEndless(): void {
    if (this.status !== 'won') return;
    this.endless = true;
    this.status = 'playing';
  }
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
