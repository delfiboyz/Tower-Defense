import './style.css';
import { ENEMIES, MAX_WAVES, TARGET_LABELS, TILE, TOWERS, TOWER_ORDER, WIDTH, waveSummary, type TowerId } from './config';
import { loadSprites, tinted, type Sprites } from './assets';
import { AudioEngine } from './audio';
import { Game, type Tower } from './game';
import { Renderer, type ViewState } from './renderer';
import { loadBest, loadSettings, saveBest, saveSettings } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game');
const ui = {
  lives: $('lives'), gold: $('gold'), wave: $('wave'), score: $('score'),
  pause: $<HTMLButtonElement>('btn-pause'), mute: $<HTMLButtonElement>('btn-mute'), menu: $<HTMLButtonElement>('btn-menu'),
  shop: $('shop'), waveBtn: $<HTMLButtonElement>('btn-wave'), autoWave: $<HTMLInputElement>('auto-wave'), preview: $('wave-preview'),
  toast: $('toast'),
  inspector: $('inspector'), insIcon: $<HTMLImageElement>('ins-icon'), insName: $('ins-name'), insLevel: $('ins-level'),
  insStats: $('ins-stats'), insTarget: $<HTMLButtonElement>('ins-target'), insUpgrade: $<HTMLButtonElement>('ins-upgrade'),
  insSell: $<HTMLButtonElement>('ins-sell'), insClose: $<HTMLButtonElement>('ins-close'),
  modal: $('modal'), modalTitle: $('modal-title'), modalText: $('modal-text'), modalBest: $('modal-best'), modalActions: $('modal-actions'),
};

const audio = new AudioEngine();
const settings = loadSettings();
audio.setMuted(settings.muted);

let sprites: Sprites;
let game: Game;
let renderer: Renderer;
let speed = 1;
let paused = true;
const view: ViewState = { hoverTile: null, placing: null, selected: null, showGrid: false };

// ── Setup ─────────────────────────────────────────────────────────────────

function newGame(): void {
  game = new Game();
  game.autoWave = ui.autoWave.checked;
  renderer = new Renderer(canvas, sprites, game);
  renderer.resize();
  view.selected = null;
  view.placing = null;
  game.on((e) => {
    switch (e.type) {
      case 'shoot':
        if (e.tower.def.id === 'rocket') audio.tone('rocket', 180, 0.25, 'sawtooth', 0.06, 0.3);
        else if (e.tower.def.id === 'sniper') audio.tone('sniper', 1400, 0.12, 'square', 0.05, 0.2);
        else if (e.tower.def.id === 'frost') audio.tone('frost', 900, 0.15, 'sine', 0.06, 1.6);
        else audio.tone('blaster', 620, 0.06, 'square', 0.03, 0.6);
        break;
      case 'hit': audio.play('hit-enemy', 0.5); break;
      case 'kill': audio.play('enemy-die', e.enemy.def.id === 'boss' ? 1 : 0.7); bump(ui.gold); break;
      case 'explode': if (!e.frost) audio.tone('boom', 120, 0.35, 'triangle', 0.12, 0.25); break;
      case 'leak': audio.tone('leak', 220, 0.4, 'sawtooth', 0.1, 0.4); bump(ui.lives); break;
      case 'build': case 'upgrade': audio.tone('build', 440, 0.18, 'triangle', 0.08, 2); break;
      case 'sell': audio.tone('sell', 880, 0.15, 'triangle', 0.06, 0.5); break;
      case 'waveStart':
        toast(e.early ? `Gelombang ${e.wave} — bonus awal +${e.early}` : `Gelombang ${e.wave}`);
        break;
      case 'waveCleared':
        toast(`Gelombang ${e.wave} selesai! +${e.bonus} emas`);
        audio.tone('clear', 523, 0.4, 'triangle', 0.08, 2);
        break;
      case 'gameOver': setTimeout(() => showGameOver(e.win), 600); break;
    }
  });
  refreshPreview();
}

function buildShop(): void {
  for (const id of TOWER_ORDER) {
    const def = TOWERS[id];
    const card = document.createElement('button');
    card.className = 'tower-card';
    card.dataset.tower = id;
    const lvl = def.levels[0];
    card.dataset.tip = `${def.description} DMG ${lvl.damage} · RNG ${lvl.range} · ${lvl.fireRate}/s`;
    card.setAttribute('aria-label', `${def.name}, ${lvl.cost} emas. ${def.description}`);
    card.innerHTML = `<img alt="" src="${towerIcon(id)}"><b>${def.name}</b><span class="cost">◆ ${lvl.cost}</span><kbd>${def.hotkey}</kbd>`;
    card.addEventListener('pointerdown', (e) => startShopDrag(e, id));
    ui.shop.append(card);
  }
}

function towerIcon(id: TowerId): string {
  const def = TOWERS[id];
  return def.tint ? tinted(sprites[def.sprite], def.tint).toDataURL() : sprites[def.sprite].src;
}

// ── Input ─────────────────────────────────────────────────────────────────

function tileFromClient(clientX: number, clientY: number): { tx: number; ty: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const scale = WIDTH / rect.width;
  return { tx: Math.floor(((clientX - rect.left) * scale) / TILE), ty: Math.floor(((clientY - rect.top) * scale) / TILE) };
}

function setPlacing(id: TowerId | null): void {
  view.placing = id;
  if (id) select(null);
  for (const card of ui.shop.querySelectorAll<HTMLElement>('.tower-card')) {
    card.classList.toggle('active', card.dataset.tower === id);
  }
}

function tryPlace(tx: number, ty: number): boolean {
  if (!view.placing) return false;
  const def = TOWERS[view.placing];
  if (game.gold < def.levels[0].cost) {
    toast('Emas tidak cukup');
    return false;
  }
  if (!game.canPlace(tx, ty)) return false;
  game.placeTower(view.placing, tx, ty);
  return true;
}

function startShopDrag(e: PointerEvent, id: TowerId): void {
  if (e.button !== 0) return;
  void audio.unlock();
  const card = e.currentTarget as HTMLElement;
  if (card.hasAttribute('disabled')) return;
  const wasActive = view.placing === id;
  setPlacing(id);
  let dragged = false;
  const move = (ev: PointerEvent) => {
    const tile = tileFromClient(ev.clientX, ev.clientY);
    if (tile) dragged = true;
    view.hoverTile = tile;
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const tile = tileFromClient(ev.clientX, ev.clientY);
    if (dragged) {
      // Drag & drop, like the original game.
      if (tile) tryPlace(tile.tx, tile.ty);
      setPlacing(null);
    } else if (wasActive) {
      setPlacing(null);
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

canvas.addEventListener('pointermove', (e) => {
  view.hoverTile = tileFromClient(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  if (view.placing) view.hoverTile = null;
});
canvas.addEventListener('pointerdown', (e) => {
  void audio.unlock();
  const tile = tileFromClient(e.clientX, e.clientY);
  if (!tile) return;
  view.hoverTile = tile;
  if (view.placing) {
    // Keep placing on desktop (shift) for quick multi-builds.
    if (tryPlace(tile.tx, tile.ty) && !e.shiftKey) setPlacing(null);
    return;
  }
  select(game.towerAt(tile.tx, tile.ty) ?? null);
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  setPlacing(null);
  select(null);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.repeat) return;
  const tower = TOWER_ORDER.find((id) => TOWERS[id].hotkey === e.key);
  if (tower) { setPlacing(view.placing === tower ? null : tower); return; }
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); if (game.status === 'playing' && ui.modal.hidden) setPaused(true, true); else if (!ui.modal.hidden && game.status === 'playing') resume(); break;
    case 'escape':
      if (view.placing || view.selected) { setPlacing(null); select(null); }
      else if (ui.modal.hidden) setPaused(true, true);
      else if (game.status === 'playing') resume();
      break;
    case 'f': setSpeed(speed === 3 ? 1 : speed + 1); break;
    case 'n': nextWave(); break;
    case 'm': toggleMute(); break;
    case 'g': view.showGrid = !view.showGrid; break;
    case 'u': if (view.selected) upgradeSelected(); break;
    case 's': if (view.selected) sellSelected(); break;
    case 't': if (view.selected) { game.cycleTargetMode(view.selected); refreshInspector(); } break;
    case 'r': restart(); break;
  }
});

// ── Controls ──────────────────────────────────────────────────────────────

function setSpeed(s: number): void {
  speed = s;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.classList.toggle('active', Number(b.dataset.speed) === s);
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
}

function toggleMute(): void {
  audio.setMuted(!audio.muted);
  settings.muted = audio.muted;
  saveSettings(settings);
  ui.mute.textContent = audio.muted ? '🔇' : '🔊';
}
ui.mute.textContent = audio.muted ? '🔇' : '🔊';
ui.mute.addEventListener('click', toggleMute);
ui.pause.addEventListener('click', () => (paused ? resume() : setPaused(true, true)));
ui.menu.addEventListener('click', () => setPaused(true, true));
ui.autoWave.checked = settings.autoWave;
ui.autoWave.addEventListener('change', () => {
  game.autoWave = ui.autoWave.checked;
  settings.autoWave = ui.autoWave.checked;
  saveSettings(settings);
  if (game.autoWave && game.wave > 0 && !game.waveInProgress) game.autoTimer = 2;
});
ui.waveBtn.addEventListener('click', nextWave);

function nextWave(): void {
  void audio.unlock();
  if (paused && game.status === 'playing') resume();
  if (game.startNextWave()) refreshPreview();
}

function select(tower: Tower | null): void {
  view.selected = tower;
  ui.inspector.hidden = !tower;
  if (tower) refreshInspector();
}

function upgradeSelected(): void {
  if (view.selected && game.upgradeTower(view.selected)) refreshInspector();
}
function sellSelected(): void {
  if (!view.selected) return;
  game.sellTower(view.selected);
  select(null);
}
ui.insUpgrade.addEventListener('click', upgradeSelected);
ui.insSell.addEventListener('click', sellSelected);
ui.insClose.addEventListener('click', () => select(null));
ui.insTarget.addEventListener('click', () => {
  if (!view.selected) return;
  game.cycleTargetMode(view.selected);
  refreshInspector();
});

function refreshInspector(): void {
  const t = view.selected;
  if (!t) return;
  const cur = t.def.levels[t.level];
  const next = t.def.levels[t.level + 1];
  ui.insIcon.src = towerIcon(t.def.id);
  ui.insName.textContent = t.def.name;
  ui.insLevel.textContent = `Level ${t.level + 1}/${t.def.levels.length} · ${t.kills} kill`;
  const row = (label: string, a: number, b?: number, fmt = (v: number) => String(v)) =>
    `<dt>${label}</dt><dd>${fmt(a)}${b !== undefined && b !== a ? ` <span class="up">→ ${fmt(b)}</span>` : ''}</dd>`;
  ui.insStats.innerHTML =
    row('Damage', cur.damage, next?.damage) +
    row('Jangkauan', cur.range, next?.range) +
    row('Tembakan/s', cur.fireRate, next?.fireRate) +
    (cur.splash ? row('Area', cur.splash, next?.splash) : '') +
    (cur.slow ? row('Lambat', cur.slow, next?.slow, (v) => `${Math.round((1 - v) * 100)}%`) : '') +
    (t.def.armorPierce ? '<dt>Spesial</dt><dd>Tembus armor</dd>' : '');
  ui.insTarget.textContent = `🎯 Target: ${TARGET_LABELS[t.target]}`;
  const cost = game.upgradeCost(t);
  ui.insUpgrade.textContent = cost === null ? 'Level Maks' : `Upgrade ◆ ${cost}`;
  ui.insUpgrade.disabled = cost === null || game.gold < cost;
  ui.insSell.textContent = `Jual ◆ ${game.sellValue(t)}`;
}

function refreshPreview(): void {
  const upcoming = game.wave + 1;
  const done = !game.endless && game.wave >= MAX_WAVES;
  ui.preview.innerHTML = done ? '' : Object.entries(waveSummary(upcoming)).map(([id, count]) => {
    const def = ENEMIES[id as keyof typeof ENEMIES];
    const src = def.tint ? tinted(sprites[def.sprite], def.tint).toDataURL() : sprites[def.sprite].src;
    return `<span title="${def.name}"><img alt="${def.name}" src="${src}">${count}</span>`;
  }).join('');
}

// ── HUD ───────────────────────────────────────────────────────────────────

let toastTimer = 0;
function toast(msg: string): void {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 2200);
}

function bump(el: HTMLElement): void {
  const stat = el.parentElement!;
  stat.classList.remove('bump');
  void stat.offsetWidth;
  stat.classList.add('bump');
}

const freshShown = () => ({ lives: -1, gold: -1, wave: '', score: -1, waveBtn: '' });
let shown = freshShown();
function updateHud(): void {
  if (shown.lives !== game.lives) ui.lives.textContent = String((shown.lives = game.lives));
  if (shown.gold !== game.gold) {
    ui.gold.textContent = String((shown.gold = game.gold));
    for (const card of ui.shop.querySelectorAll<HTMLButtonElement>('.tower-card')) {
      card.disabled = game.gold < TOWERS[card.dataset.tower as TowerId].levels[0].cost;
    }
    if (view.selected) refreshInspector();
  }
  const waveText = game.endless ? `${game.wave}` : `${game.wave}/${MAX_WAVES}`;
  if (shown.wave !== waveText) {
    ui.wave.textContent = shown.wave = waveText;
    refreshPreview();
  }
  if (shown.score !== game.score) ui.score.textContent = String((shown.score = game.score));

  let label: string;
  if (!game.endless && game.wave >= MAX_WAVES) label = 'Gelombang terakhir';
  else if (game.autoTimer > 0) label = `Berikutnya dalam ${Math.ceil(game.autoTimer)}… ▶`;
  else if (game.waveInProgress) label = `Panggil lebih awal (+${10 + game.wave * 3}) ▶▶`;
  else label = game.wave === 0 ? 'Mulai Gelombang ▶' : `Gelombang ${game.wave + 1} ▶`;
  if (shown.waveBtn !== label) {
    ui.waveBtn.textContent = shown.waveBtn = label;
    ui.waveBtn.disabled = !game.endless && game.wave >= MAX_WAVES;
  }
  ui.pause.textContent = paused ? '▶' : '❚❚';
}

// ── Modal / flow ──────────────────────────────────────────────────────────

function showModal(title: string, text: string, actions: [string, () => void, string?][]): void {
  ui.modalTitle.textContent = title;
  ui.modalText.textContent = text;
  const best = loadBest();
  ui.modalBest.textContent = best.score > 0 ? `Rekor: ★ ${best.score} · gelombang ${best.wave}` : '';
  ui.modalActions.replaceChildren(...actions.map(([label, fn, cls]) => {
    const b = document.createElement('button');
    b.className = `btn big ${cls ?? ''}`;
    b.textContent = label;
    b.addEventListener('click', () => { void audio.unlock(); fn(); });
    return b;
  }));
  ui.modal.hidden = false;
  (ui.modalActions.firstElementChild as HTMLElement | null)?.focus();
}

function setPaused(p: boolean, withMenu = false): void {
  paused = p;
  if (p && withMenu && game.status === 'playing') {
    showModal(game.wave === 0 ? 'Tower Defense' : 'Jeda', game.wave === 0 ? 'Pertahankan basismu dari 20 gelombang musuh.' : 'Permainan dijeda.', [
      [game.wave === 0 ? 'Main' : 'Lanjutkan', resume, 'primary'],
      ['Mulai ulang', restart],
    ]);
  }
}

function resume(): void {
  ui.modal.hidden = true;
  paused = false;
}

function restart(): void {
  newGame();
  shown = freshShown();
  resume();
}

function showGameOver(win: boolean): void {
  const best = loadBest();
  const isRecord = game.score > best.score;
  if (isRecord) saveBest({ score: game.score, wave: game.wave });
  paused = true;
  const summary = `Skor ${game.score} · ${game.kills} musuh dikalahkan · gelombang ${game.wave}${isRecord ? ' · REKOR BARU!' : ''}`;
  if (win) {
    showModal('Kamu Menang! 🎉', summary, [
      ['Lanjut mode Endless', () => { game.continueEndless(); shown.wave = ''; resume(); }, 'primary'],
      ['Main lagi', restart],
    ]);
  } else {
    showModal('Kamu Kalah', summary, [['Coba lagi', restart, 'primary']]);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && game.status === 'playing') setPaused(true, true);
});

// ── Main loop ─────────────────────────────────────────────────────────────

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt * speed;
    while (acc >= STEP) {
      game.update(STEP);
      acc -= STEP;
    }
    renderer.tick(dt * speed);
  }
  renderer.draw(view);
  updateHud();
  requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  sprites = await loadSprites();
  buildShop();
  newGame();
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  setPaused(true, true);
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

void boot();
