type Sample = 'hit-enemy' | 'enemy-die';

/** Small Web Audio mixer: decoded samples from the original game plus synthesized blips. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Sample, AudioBuffer>();
  private lastPlayed = new Map<string, number>();
  private _muted = false;
  private _volume = 0.6;

  get muted(): boolean { return this._muted; }
  get volume(): number { return this._volume; }

  /** Must be called from a user gesture (browser autoplay policy). */
  async unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    await Promise.all((['hit-enemy', 'enemy-die'] as Sample[]).map(async (name) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}assets/audio/${name}.ogg`);
        this.buffers.set(name, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // Some browsers cannot decode Ogg; synthesized sounds still work.
      }
    }));
  }

  setMuted(muted: boolean): void { this._muted = muted; this.applyVolume(); }
  setVolume(volume: number): void { this._volume = volume; this.applyVolume(); }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this._muted ? 0 : this._volume;
  }

  /** Avoids stacking dozens of identical sounds in the same frame. */
  private throttle(key: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -1) < minGap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  play(name: Sample, gain = 1): void {
    const buffer = this.buffers.get(name);
    if (!this.ctx || !this.master || !buffer || !this.throttle(name, 0.04)) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start();
  }

  tone(key: string, freq: number, duration: number, type: OscillatorType = 'square', gain = 0.08, slide = 0.5): void {
    if (!this.ctx || !this.master || !this.throttle(key, 0.05)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }
}
