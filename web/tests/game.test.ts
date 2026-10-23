import { describe, expect, it } from 'vitest';
import { MAX_WAVES, START_GOLD, TILE, TOWERS, buildWave } from '../src/config';
import { Game } from '../src/game';
import { Path } from '../src/path';

function run(game: Game, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60);
}

describe('Path', () => {
  it('samples start, end and marks path cells', () => {
    const path = new Path();
    expect(path.sample(0)).toMatchObject({ x: -0.5 * TILE, y: 2.5 * TILE });
    expect(path.sample(path.length).x).toBeCloseTo(20.5 * TILE);
    expect(path.isPathCell(4, 5)).toBe(true);
    expect(path.isPathCell(0, 0)).toBe(false);
  });
});

describe('Game', () => {
  it('builds, upgrades and sells towers', () => {
    const game = new Game();
    expect(game.canPlace(4, 4)).toBe(false); // on the path
    const tower = game.placeTower('blaster', 5, 4)!;
    expect(tower).toBeTruthy();
    expect(game.gold).toBe(START_GOLD - TOWERS.blaster.levels[0].cost);
    expect(game.placeTower('blaster', 5, 4)).toBeNull(); // occupied
    expect(game.upgradeTower(tower)).toBe(true);
    expect(tower.level).toBe(1);
    const before = game.gold;
    game.sellTower(tower);
    expect(game.towers).toHaveLength(0);
    expect(game.gold).toBe(before + Math.floor(tower.invested * 0.7));
  });

  it('rejects towers the player cannot afford', () => {
    const game = new Game();
    game.gold = 10;
    expect(game.placeTower('rocket', 5, 4)).toBeNull();
  });

  it('loses lives when enemies leak and ends the game', () => {
    const game = new Game();
    game.lives = 1;
    game.startNextWave();
    run(game, 30);
    expect(game.status).toBe('lost');
  });

  it('defended waves are cleared and reward gold', () => {
    const game = new Game();
    game.gold = 10_000;
    for (const [x, y] of [[5, 3], [3, 3], [5, 6], [8, 6], [10, 4], [8, 4], [13, 4], [15, 7]]) {
      const t = game.placeTower('blaster', x, y)!;
      game.upgradeTower(t);
      game.upgradeTower(t);
    }
    const events: string[] = [];
    game.on((e) => events.push(e.type));
    game.startNextWave();
    run(game, 40);
    expect(events).toContain('waveCleared');
    expect(game.lives).toBe(20);
    expect(game.kills).toBe(buildWave(1).length);
  });

  it('grants a bonus for calling a wave early', () => {
    const game = new Game();
    game.startNextWave();
    run(game, 1);
    const gold = game.gold;
    game.startNextWave();
    expect(game.gold).toBeGreaterThan(gold);
    expect(game.wave).toBe(2);
  });

  it('target modes pick different enemies', () => {
    const game = new Game();
    const t = game.placeTower('sniper', 3, 4)!;
    game.startNextWave();
    run(game, 2.2);
    expect(game.enemies.length).toBeGreaterThan(1);
    t.target = 'first';
    const first = game.findTarget(t);
    t.target = 'last';
    const last = game.findTarget(t);
    expect(first && last && first.progress >= last.progress).toBe(true);
  });

  it('stops at the final wave unless endless', () => {
    const game = new Game();
    game.wave = MAX_WAVES;
    expect(game.startNextWave()).toBe(false);
  });
});

describe('waves', () => {
  it('include bosses every fifth wave', () => {
    expect(buildWave(5).some((s) => s.type === 'boss')).toBe(true);
    expect(buildWave(4).some((s) => s.type === 'boss')).toBe(false);
  });
});
