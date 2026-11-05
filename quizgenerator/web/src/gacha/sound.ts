/* ------------------------------------------------------------------ *
 * Gacha sound design — synthesized with WebAudio, zero asset weight.
 * Layered cues follow the classic anticipation curve:
 *   click → dribble (loop during shake) → tiered fanfare on reveal.
 * ...inspired by slot-machine sound curves: rising pitch = rising stakes.
 * ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35; // never shocking
      masterGain.connect(ctx.destination);
    } catch {
      return null; // old browsers / disabled audio sandbox
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return masterGain ? { ctx, out: masterGain } : null;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (masterGain) masterGain.gain.value = value ? 0 : 0.35;
}

function tone(
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.3
): void {
  const a = audio();
  if (!a || muted) return;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(env).connect(a.out);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export const sfx = {
  /** UI click / chest select — short woody tap. */
  click(): void {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    tone(220, t, 0.06, 'triangle', 0.2);
    tone(440, t + 0.01, 0.04, 'square', 0.06);
  },

  /** Soft "tap tap" while the chest shakes; pitch rises per-shake since
   *  callers pass an intensity 0..1 — mapped to 90..160 Hz. */
  shakeTick(intensity: number): void {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    tone(90 + intensity * 80, t, 0.05, 'triangle', 0.18);
  },

  /** Chest pops open — thud + snap. */
  crack(): void {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    tone(70, t, 0.18, 'sine', 0.5);
    tone(1200, t + 0.02, 0.05, 'square', 0.12);
    tone(2400, t + 0.03, 0.08, 'sawtooth', 0.05);
  },

  /** Rarity fanfare — the dopamine drop.
   *  common: single soft pop; rare: two-note rise; epic: four-note
   *  arpeggio; legendary: 5-note fanfare, wide root note + shimmer. */
  reveal(rarity: 'common' | 'rare' | 'epic' | 'legendary'): void {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    switch (rarity) {
      case 'common':
        tone(392, t, 0.15, 'triangle', 0.22);
        break;
      case 'rare':
        tone(523, t, 0.12, 'triangle', 0.24);
        tone(784, t + 0.09, 0.22, 'triangle', 0.24);
        break;
      case 'epic':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.25, 'triangle', 0.25));
        break;
      case 'legendary':
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.11, 0.4, 'sawtooth', 0.16));
        tone(131, t, 1.6, 'sine', 0.35); // wide root swell under the arpeggio
        [2637, 3136, 3951].forEach((f, i) => tone(f, t + 0.7 + i * 0.04, 0.5, 'sine', 0.05)); // shimmer
        break;
    }
  },

  /** Currency jingle for gem conversions & daily claim. */
  coins(): void {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    [988, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.05, 0.18, 'sine', 0.12));
  },

  /** Error / insufficient funds — low double-buzz (displeasure, no sting). */
  error(): void {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    tone(160, t, 0.14, 'sawtooth', 0.12);
    tone(120, t + 0.16, 0.2, 'sawtooth', 0.12);
  },
};
