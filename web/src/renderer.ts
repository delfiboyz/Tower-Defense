import { COLS, HEIGHT, ROWS, TILE, TOWERS, WIDTH, type TowerId } from './config';
import { tinted, type Sprites } from './assets';
import type { Game, GameEvent, Tower } from './game';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

interface Floater { x: number; y: number; text: string; color: string; life: number }
interface Ring { x: number; y: number; radius: number; life: number; color: string }

export interface ViewState {
  hoverTile: { tx: number; ty: number } | null;
  placing: TowerId | null;
  selected: Tower | null;
  showGrid: boolean;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private shake = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly sprites: Sprites, private readonly game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.background = this.buildBackground();
    game.on((e) => this.onEvent(e));
  }

  /** Matches the backing store to the element size for crisp HiDPI rendering. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  }

  private buildBackground(): HTMLCanvasElement {
    const bg = document.createElement('canvas');
    bg.width = WIDTH;
    bg.height = HEIGHT;
    const ctx = bg.getContext('2d')!;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) ctx.drawImage(this.sprites.tile_grass, x * TILE, y * TILE, TILE, TILE);
    }
    // Soft vignette
    const vg = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, WIDTH * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,20,10,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const pts = this.game.path.points;
    const stroke = (width: number, color: string) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    stroke(TILE * 0.98, 'rgba(0,0,0,0.18)');
    stroke(TILE * 0.9, '#a5703f');
    stroke(TILE * 0.78, '#c48b52');
    ctx.setLineDash([6, 18]);
    stroke(3, 'rgba(255,240,210,0.35)');
    ctx.setLineDash([]);
    return bg;
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'hit':
        this.floaters.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y - 14, text: String(e.damage), color: '#fff', life: 0.7 });
        this.burst(e.x, e.y, 4, '#ffe08a', 80, 0.25);
        break;
      case 'kill':
        this.burst(e.enemy.x, e.enemy.y, e.enemy.def.id === 'boss' ? 40 : 14, e.enemy.def.tint ?? '#7cff9b', 160, 0.6);
        this.floaters.push({ x: e.enemy.x, y: e.enemy.y - 24, text: `+${e.reward}`, color: '#ffd54a', life: 1 });
        if (e.enemy.def.id === 'boss') this.shake = 0.5;
        break;
      case 'explode':
        this.rings.push({ x: e.x, y: e.y, radius: e.radius, life: 0.35, color: e.frost ? '#7fd8ff' : '#ff9d42' });
        this.burst(e.x, e.y, e.frost ? 10 : 18, e.frost ? '#bfefff' : '#ffb347', 200, 0.45);
        if (!e.frost) this.shake = Math.max(this.shake, 0.12);
        break;
      case 'leak':
        this.shake = 0.35;
        break;
      case 'build':
      case 'upgrade':
        this.rings.push({ x: e.tower.x, y: e.tower.y, radius: TILE * 0.7, life: 0.4, color: '#9dffb0' });
        this.burst(e.tower.x, e.tower.y, 12, '#d6ffe0', 120, 0.4);
        break;
      case 'sell':
        this.burst(e.tower.x, e.tower.y, 12, '#ffd54a', 120, 0.4);
        break;
    }
  }

  private burst(x: number, y: number, count: number, color: string, speed: number, life: number): void {
    if (this.reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, maxLife: life, size: 2 + Math.random() * 3, color });
    }
  }

  /** Advances purely visual effects. */
  tick(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= 30 * dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shake = Math.max(0, this.shake - dt);
  }

  draw(view: ViewState): void {
    const { ctx, canvas, game } = this;
    const scale = canvas.width / WIDTH;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (this.shake > 0 && !this.reducedMotion) {
      const m = this.shake * 10;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.background, 0, 0);

    if (view.placing || view.showGrid) this.drawGrid();
    if (view.selected) this.drawRange(view.selected.x, view.selected.y, view.selected.def.levels[view.selected.level].range, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.6)');

    for (const t of game.towers) this.drawTower(t, t === view.selected);
    for (const e of game.enemies) this.drawEnemy(e);
    for (const p of game.projectiles) {
      const img = this.sprites[p.tower.def.bullet];
      const size = p.tower.def.bullet === 'bullet_2' ? 26 : 18;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      if (p.stats.slow) ctx.filter = 'hue-rotate(180deg) saturate(1.6)';
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    for (const r of this.rings) {
      const t = 1 - r.life / 0.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * Math.min(1, 0.4 + t), 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life / 0.4);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (view.placing && view.hoverTile) this.drawGhost(view.placing, view.hoverTile.tx, view.hoverTile.ty);
  }

  private drawGrid(): void {
    const { ctx, game } = this;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!game.canPlace(x, y)) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
      }
    }
  }

  private drawRange(x: number, y: number, range: number, fill: string, stroke: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, range * TILE, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawGhost(id: TowerId, tx: number, ty: number): void {
    const { ctx, game } = this;
    const def = TOWERS[id];
    const ok = game.canPlace(tx, ty) && game.gold >= def.levels[0].cost;
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    this.drawRange(x, y, def.levels[0].range, ok ? 'rgba(120,255,160,0.12)' : 'rgba(255,90,90,0.12)', ok ? 'rgba(120,255,160,0.8)' : 'rgba(255,90,90,0.8)');
    ctx.fillStyle = ok ? 'rgba(120,255,160,0.25)' : 'rgba(255,90,90,0.3)';
    ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    ctx.globalAlpha = 0.7;
    this.drawTowerBody(id, x, y, -Math.PI / 2, 0, 0);
    ctx.globalAlpha = 1;
  }

  private drawTower(t: Tower, selected: boolean): void {
    const { ctx } = this;
    if (selected) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.roundRect(t.tx * TILE + 2, t.ty * TILE + 2, TILE - 4, TILE - 4, 10);
      ctx.fill();
    }
    this.drawTowerBody(t.def.id, t.x, t.y, t.angle, t.level, t.recoil);
    // Level pips
    for (let i = 0; i <= t.level; i++) {
      ctx.beginPath();
      ctx.arc(t.x - 10 + i * 10, t.y + TILE * 0.38, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd54a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawTowerBody(id: TowerId, x: number, y: number, angle: number, level: number, recoil: number): void {
    const { ctx, sprites } = this;
    const def = TOWERS[id];
    ctx.drawImage(sprites.tower_plate, x - TILE * 0.46, y - TILE * 0.46, TILE * 0.92, TILE * 0.92);
    const head = def.tint ? tinted(sprites[def.sprite], def.tint) : sprites[def.sprite];
    const size = TILE * (0.78 + level * 0.06);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.translate(0, recoil * 4);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(head, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private drawEnemy(e: Game['enemies'][number]): void {
    const { ctx, sprites } = this;
    const size = e.def.size * TILE;
    const base = sprites[e.def.sprite];
    const img = e.def.tint ? tinted(base, e.def.tint) : base;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    if (e.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    else if (e.slowTimer > 0) ctx.filter = 'hue-rotate(160deg) saturate(1.4)';
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();

    if (e.hp < e.maxHp) {
      const w = Math.max(28, size * 0.8);
      const h = 5;
      const bx = e.x - w / 2;
      const by = e.y - size / 2 - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(bx - 1, by - 1, w + 2, h + 2, 3);
      ctx.fill();
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#5cff8a' : pct > 0.25 ? '#ffd54a' : '#ff5b5b';
      ctx.beginPath();
      ctx.roundRect(bx, by, w * pct, h, 2);
      ctx.fill();
    }
  }
}
