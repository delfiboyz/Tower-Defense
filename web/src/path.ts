import { COLS, ROWS, TILE } from './config';

export interface Point { x: number; y: number }
export interface PathSample extends Point { angle: number }

/** Waypoints in tile coordinates; the first and last sit just outside the board. */
export const WAYPOINTS: Point[] = [
  { x: -1, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 7 }, { x: 9, y: 7 }, { x: 9, y: 3 },
  { x: 14, y: 3 }, { x: 14, y: 8 }, { x: 17, y: 8 }, { x: 17, y: 5 }, { x: COLS, y: 5 },
];

export class Path {
  readonly points: Point[];
  readonly length: number;
  private readonly cumulative: number[];
  private readonly cells = new Set<string>();

  constructor(waypoints: Point[] = WAYPOINTS) {
    this.points = waypoints.map((p) => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE }));
    this.cumulative = [0];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      this.cumulative.push(this.cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cumulative[this.cumulative.length - 1];

    for (let i = 1; i < waypoints.length; i++) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(a.x + ((b.x - a.x) * s) / steps);
        const y = Math.round(a.y + ((b.y - a.y) * s) / steps);
        this.cells.add(`${x},${y}`);
      }
    }
  }

  isPathCell(tx: number, ty: number): boolean {
    return this.cells.has(`${tx},${ty}`);
  }

  isInside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;
  }

  /** Position and heading after travelling `distance` pixels along the path. */
  sample(distance: number): PathSample {
    const d = Math.min(Math.max(distance, 0), this.length);
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i] < d) i++;
    const a = this.points[i - 1];
    const b = this.points[i];
    const segLen = this.cumulative[i] - this.cumulative[i - 1];
    const t = segLen === 0 ? 0 : (d - this.cumulative[i - 1]) / segLen;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
}
