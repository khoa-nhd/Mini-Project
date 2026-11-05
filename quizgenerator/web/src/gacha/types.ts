export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  icon: string;
  blurb: string;
}

export interface Chest {
  id: string;
  name: string;
  icon: string;
  sparkleCost: number;
  gemCost: number | null;
  rates: { rarity: Rarity; percent: number }[];
  guaranteedInterval: number;
  guaranteedFloor: Rarity;
  hardPity: number;
  accent: string;
}

export interface Drop {
  item: Item;
  rarity: Rarity;
  duplicate: boolean;
  gemsAwarded: number;
  viaPity: 'none' | 'guarantee-floor' | 'soft-pity' | 'hard-pity';
}

export interface PlayerSnapshot {
  pid: string;
  sparkles: number;
  gems: number;
  owned: Record<string, number>;
  equippedItemId?: string;
  totalPulls: number;
}

export interface PityInfo {
  id: string;
  pullsSinceLegendary: number;
  pullsUntilHardPity: number;
  pullsUntilGuarantee: number;
}

export interface OpenResponse {
  drops: Drop[];
  player: PlayerSnapshot;
  chest: Chest;
}

export const RARITY_STYLES: Record<
  Rarity,
  { card: string; text: string; glow: string; label: string; ring: string }
> = {
  common: {
    card: 'from-slate-700 to-slate-800',
    text: 'text-slate-300',
    glow: 'shadow-slate-500/20',
    label: 'Common',
    ring: 'ring-slate-500/30',
  },
  rare: {
    card: 'from-sky-700 to-blue-900',
    text: 'text-sky-300',
    glow: 'shadow-sky-500/40',
    label: 'Rare',
    ring: 'ring-sky-400/40',
  },
  epic: {
    card: 'from-fuchsia-700 to-purple-900',
    text: 'text-fuchsia-300',
    glow: 'shadow-fuchsia-500/50',
    label: 'Epic',
    ring: 'ring-fuchsia-400/50',
  },
  legendary: {
    card: 'from-amber-600 to-orange-800',
    text: 'text-amber-300',
    glow: 'shadow-amber-400/60',
    label: 'Legendary',
    ring: 'ring-amber-300/60',
  },
};
