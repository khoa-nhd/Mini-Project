import crypto from 'crypto';
import {
  CHESTS_BY_ID,
  DUPLICATE_GEM_VALUES,
  ITEMS_BY_ID,
  RARITY_ORDER,
  getItemsByRarity,
  type ChestConfig,
  type Item,
  type Rarity,
} from './data.js';

/* ------------------------------------------------------------------ *
 * Drop engine. Deterministic given a seeded RNG so tests can replay.
 * ------------------------------------------------------------------ */

/** xorshift/mulberry32 — small, fast, easily seeded for simulation tests. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultRng(): Rng {
  // 6 random bytes = uniform in [0, 1), independent of randomInt's range cap.
  return () => crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

/** Per-chest pity state tracked for every player. */
export interface PityState {
  pullsSinceLegendary: number;
  pullsSinceGuarantee: number;
}

export interface RolledDrop {
  item: Item;
  rarity: Rarity;
  /** True when the item was owned and auto-recycled into gems. */
  duplicate: boolean;
  gemsAwarded: number;
  /** Which pity mechanic resolved the pull (for analytics + client polish). */
  viaPity: 'none' | 'guarantee-floor' | 'soft-pity' | 'hard-pity';
}

function rarityIndex(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

/**
 * Weighted random over the chest's rarity rates, with:
 *  1. hard-pity force for legendary after `hardPity` consecutive misses,
 *  2. soft-pity ramp from `softPityStart`, adding `softPityStep` points/pull,
 *  3. guarantee floor every `guaranteedInterval` pulls (anti-frustration).
 */
export function rollRarity(
  chest: ChestConfig,
  pity: PityState,
  rng: Rng
): { rarity: Rarity; viaPity: RolledDrop['viaPity'] } {
  // 1. Hard pity — legendary cannot take longer than `hardPity` pulls.
  if (pity.pullsSinceLegendary >= chest.hardPity) {
    return { rarity: 'legendary', viaPity: 'hard-pity' };
  }

  // 2. Guarantee floor — anti-frustration minimum every N pulls.
  if (pity.pullsSinceGuarantee + 1 >= chest.guaranteedInterval) {
    // Force the floor tier only if the weighted roll wouldn't beat it anyway.
    const rolled = weightedRarity(chest, 0, pity, rng);
    if (rarityIndex(rolled.rarity) < rarityIndex(chest.guaranteedFloor)) {
      return { rarity: chest.guaranteedFloor, viaPity: 'guarantee-floor' };
    }
    return rolled;
  }

  // 3. Soft pity — ramp legendary odds after the drought threshold.
  if (pity.pullsSinceLegendary >= chest.softPityStart) {
    const bonus =
      (pity.pullsSinceLegendary - chest.softPityStart + 1) * chest.softPityStep;
    return weightedRarity(chest, bonus, pity, rng);
  }

  return weightedRarity(chest, 0, pity, rng);
}

/** Flat weighted distribution pick; `legendaryBonusPct` shifts points from the
 *  lower tiers into legendary so total probability stays exactly 100%. */
function weightedRarity(
  chest: ChestConfig,
  legendaryBonusPct: number,
  pity: PityState,
  rng: Rng
): { rarity: Rarity; viaPity: RolledDrop['viaPity'] } {
  const weights: { rarity: Rarity; weight: number }[] = [];
  let remaining = legendaryBonusPct;
  for (const rarity of RARITY_ORDER) {
    const base = chest.rates[rarity];
    if (rarity === 'legendary') {
      weights.push({ rarity, weight: base + legendaryBonusPct });
    } else if (remaining > 0) {
      const take = Math.min(remaining, base);
      weights.push({ rarity, weight: base - take });
      remaining -= take;
    } else {
      weights.push({ rarity, weight: base });
    }
  }
  void pity;
  const total = weights.reduce((sum, w) => sum + Math.max(0, w.weight), 0);
  let roll = rng() * total;
  for (const w of weights) {
    roll -= Math.max(0, w.weight);
    if (roll < 0) return { rarity: w.rarity, viaPity: legendaryBonusPct > 0 ? 'soft-pity' : 'none' };
  }
  return { rarity: weights[weights.length - 1].rarity, viaPity: legendaryBonusPct > 0 ? 'soft-pity' : 'none' };
}

/** Pick a concrete item of the resolved rarity, then apply duplicate recycling. */
export function rollItem(
  rarity: Rarity,
  ownedCounts: Record<string, number>,
  rng: Rng
): RolledDrop {
  const pool = getItemsByRarity(rarity);
  // Prefer not-yet-owned items: equal chance among the unowned pool,
  // falling back to the whole pool (which guarantees a duplicate path).
  const fresh = pool.filter((item) => !ownedCounts[item.id]);
  const item = (fresh.length ? fresh : pool)[Math.floor(rng() * (fresh.length || pool.length))];
  if (!item) throw new Error(`No items configured for rarity ${rarity}`);

  const isDuplicate = (ownedCounts[item.id] || 0) > 0 && fresh.length === 0;
  const gemsAwarded = isDuplicate ? DUPLICATE_GEM_VALUES[rarity] : 0;
  return { item, rarity, duplicate: isDuplicate, gemsAwarded, viaPity: 'none' };
}

/**
 * Full pull: rolls rarity through pity, picks an item, and advances
 * pity counters. `ownedCounts` must be the pre-pull snapshot (updated by
 * the store after each pull so duplicates within a 10-pull still count).
 */
export function performPull(chestId: string, pity: PityState, ownedCounts: Record<string, number>, rng: Rng): RolledDrop {
  const chest = CHESTS_BY_ID.get(chestId);
  if (!chest) throw new Error(`Unknown chest: ${chestId}`);
  const { rarity, viaPity } = rollRarity(chest, pity, rng);
  const drop = rollItem(rarity, ownedCounts, rng);
  // Guarantee-floor occasionally resolves via plain weighted roll (roll >= floor);
  // in that case keep whatever viaPity weightedRarity returned, but preserve
  // soft/hard attribution from rollRarity when the floor overrode it.
  drop.viaPity = drop.rarity === rarity ? viaPity : drop.viaPity;
  if (viaPity !== 'none' && drop.viaPity === 'none') drop.viaPity = viaPity;

  pity.pullsSinceLegendary = drop.rarity === 'legendary' ? 0 : pity.pullsSinceLegendary + 1;
  pity.pullsSinceGuarantee =
    rarityIndex(drop.rarity) >= rarityIndex(chest.guaranteedFloor)
      ? 0
      : pity.pullsSinceGuarantee + 1;

  return drop;
}

/* ------------------------------------------------------------------ *
 * Simulation helper — used by QA (GACHA-DESIGN.md §7) and tests.
 * ------------------------------------------------------------------ */

export interface RarityDistribution extends Record<Rarity, number> {}

/**
 * Simulates `pullCount` chronologically-ordered pulls for a fresh player and
 * returns the empirical rarity distribution. `freshOwned` avoids duplicate
 * recycling skews by pretending nothing is owned yet.
 */
export function simulatePulls(chestId: string, pullCount: number, rng: Rng): RarityDistribution {
  const pity: PityState = { pullsSinceLegendary: 0, pullsSinceGuarantee: 0 };
  const dist: RarityDistribution = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const owned: Record<string, number> = {};
  for (let i = 0; i < pullCount; i++) {
    const drop = performPull(chestId, pity, owned, rng);
    dist[drop.rarity] += 1;
    owned[drop.item.id] = (owned[drop.item.id] || 0) + 1;
  }
  void ITEMS_BY_ID;
  return dist;
}
