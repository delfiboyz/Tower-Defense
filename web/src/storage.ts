export interface Best { score: number; wave: number }
export interface Settings { muted: boolean; autoWave: boolean }

const BEST_KEY = 'td.best';
const SETTINGS_KEY = 'td.settings';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); progress just isn't remembered.
  }
}

export const loadBest = (): Best => read(BEST_KEY, { score: 0, wave: 0 });
export const saveBest = (best: Best): void => write(BEST_KEY, best);
export const loadSettings = (): Settings => read(SETTINGS_KEY, { muted: false, autoWave: false });
export const saveSettings = (settings: Settings): void => write(SETTINGS_KEY, settings);
