import React, { useEffect, useState } from 'react';
import type { Rarity } from './types.js';

/* ------------------------------------------------------------------ *
 * Particle burst — pure CSS transforms (GPU composited), no canvas,
 * no dependency. Particle count scales with rarity, hard-capped at 30
 * so a 10x legendary summary never melts a phone's frame budget.
 * ------------------------------------------------------------------ */

const PARTICLE_COUNT: Record<Rarity, number> = {
  common: 6,
  rare: 12,
  epic: 20,
  legendary: 30,
};

const PALETTE: Record<Rarity, string[]> = {
  common: ['bg-slate-300', 'bg-slate-400', 'bg-amber-200'],
  rare: ['bg-sky-300', 'bg-sky-400', 'bg-indigo-300'],
  epic: ['bg-fuchsia-400', 'bg-purple-400', 'bg-violet-300'],
  legendary: ['bg-amber-300', 'bg-yellow-200', 'bg-orange-400', 'bg-amber-200'],
};

interface BurstProps {
  rarity: Rarity;
  /** Re-run the burst whenever key changes (one burst per reveal card). */
  burstKey: string | number;
}

interface Particle {
  angle: number;
  distance: number;
  size: number;
  delay: number;
  color: string;
  rotate: number;
}

function makeParticles(rarity: Rarity): Particle[] {
  const count = PARTICLE_COUNT[rarity];
  const palette = PALETTE[rarity];
  return Array.from({ length: count }, (_, i) => {
    const angle = (360 / count) * i + Math.random() * 12 - 6;
    return {
      angle,
      distance: 60 + Math.random() * 130,
      size: 4 + Math.random() * 6,
      delay: Math.random() * 80,
      color: palette[Math.floor(Math.random() * palette.length)],
      rotate: Math.random() * 540 - 270,
    };
  });
}

export const ParticleBurst: React.FC<BurstProps> = ({ rarity, burstKey }) => {
  const [particles, setParticles] = useState<Particle[]>(() => makeParticles(rarity));

  useEffect(() => {
    setParticles(makeParticles(rarity));
  }, [burstKey, rarity]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {particles.map((p, i) => (
        <span
          key={`${burstKey}-${i}`}
          className={`absolute rounded-sm gacha-burst ${p.color}`}
          style={
            {
              width: p.size,
              height: p.size,
              '--burst-angle': `${p.angle}deg`,
              '--burst-distance': `${p.distance}px`,
              '--burst-rotate': `${p.rotate}deg`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};
