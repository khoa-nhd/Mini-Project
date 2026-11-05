/* ------------------------------------------------------------------ *
 * Loot Chest & Gacha System — data tables.
 * All values here are the ONLY source of truth. The client receives a
 * projection of this file via GET /api/gacha/chests but never decides
 * anything — every roll, price and pity state lives server-side.
 * ------------------------------------------------------------------ */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Gems awarded when a duplicate item is recycled (anti-frustration bulk). */
export const DUPLICATE_GEM_VALUES: Record<Rarity, number> = {
  common: 2,
  rare: 8,
  epic: 30,
  legendary: 150,
};

/** Cosmetic catalogue. Everything except `id` is display-only. */
export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  icon: string; // emoji — zero asset weight
  blurb: string;
}

export const ITEMS: Item[] = [
  // Commons (65%-ish band across chests)
  { id: 'rubber_duck', name: 'Rubber Duck', rarity: 'common', icon: '🦆', blurb: 'Debug your questions out loud.' },
  { id: 'coffee_mug', name: 'Bottomless Mug', rarity: 'common', icon: '☕', blurb: 'Fuel for the 20-chapter grind.' },
  { id: 'red_pen', name: 'Teacher Red Pen', rarity: 'common', icon: '🖊️', blurb: 'Marks everything, forgives nothing.' },
  { id: 'sticky_note', name: 'Sticky Note', rarity: 'common', icon: '📝', blurb: 'Holds exactly one half-finished fact.' },
  { id: 'crumpled_paper', name: 'Crumpled Draft', rarity: 'common', icon: '📄', blurb: 'Attempt #1 of 11.' },
  // Rares
  { id: 'flash_cards', name: 'Flash Cards', rarity: 'rare', icon: '🃏', blurb: 'The old-school meta.' },
  { id: 'class_pet', name: 'Class Hamster', rarity: 'rare', icon: '🐹', blurb: 'Roams the margins of your quizzes.' },
  { id: 'silver_ruler', name: 'Silver Ruler', rarity: 'rare', icon: '📏', blurb: 'Straightens out shaky answers.' },
  { id: 'gold_star', name: 'Gold Star Sticker', rarity: 'rare', icon: '⭐', blurb: 'Certified great job.' },
  { id: 'whistle', name: 'Hall Monitor Whistle', rarity: 'rare', icon: '🎺', blurb: 'Silence! Test in progress.' },
  // Epics
  { id: 'blackboard', name: 'Pocket Blackboard', rarity: 'epic', icon: '🪟', blurb: 'Chalk-dust included.' },
  { id: 'dna_helix', name: 'DNA Helix', rarity: 'epic', icon: '🧬', blurb: 'For biology chapter bosses.' },
  { id: 'telescope', name: 'Dorm Telescope', rarity: 'epic', icon: '🔭', blurb: 'Sees answers light-years away.' },
  { id: 'lab_flask', name: 'Eureka Flask', rarity: 'epic', icon: '⚗️', blurb: 'Do not shake — it remembers.' },
  { id: 'trophy', name: 'Spelling Bee Trophy', rarity: 'epic', icon: '🏆', blurb: 'Two-time regional semifinalist.' },
  // Legendaries
  { id: 'philosophers_stone', name: "Philosopher's Stone", rarity: 'legendary', icon: '🔮', blurb: 'Turns any PDF into perfect MCQs.' },
  { id: 'wizard_hat', name: 'Wizard Hat', rarity: 'legendary', icon: '🎩', blurb: 'Bless your rolls with arcane corrections.' },
  { id: 'golden_globe', name: 'Golden Globe', rarity: 'legendary', icon: '🌐', blurb: 'Every subject at once.' },
  { id: 'diploma_of_legend', name: 'Diploma of Legend', rarity: 'legendary', icon: '📜', blurb: 'Sealed in gold wax, graded ∞/100.' },
];

export const ITEMS_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function getItemsByRarity(rarity: Rarity): Item[] {
  return ITEMS.filter((item) => item.rarity === rarity);
}

/* -------------------------- Chests -------------------------- */

export interface ChestConfig {
  id: string;
  name: string;
  icon: string;
  /** Cost per pull. If `gemCost` is also set, players may pay either currency. */
  sparkleCost: number;
  gemCost?: number;
  /** Nominal weights — must sum to 100 (display is therefore trivially honest). */
  rates: Record<Rarity, number>;
  /** Anti-frustration: forced minimum rarity every `guaranteedInterval` pulls. */
  guaranteedInterval: number;
  guaranteedFloor: Rarity;
  /** Soft pity: from pull `softPityStart` of the legendary drought, each extra
   *  failed pull adds `softPityStep` percentile points to the legendary rate. */
  softPityStart: number;
  softPityStep: number; // percentage points, e.g. 0.6 => +0.6%/pull
  /** Hard pity: legendary is forced at this drought length. */
  hardPity: number;
  accent: string; // tailwind gradient classes for the chest card
}

export const CHESTS: ChestConfig[] = [
  {
    id: 'wooden',
    name: 'Wooden Chest',
    icon: '📦',
    sparkleCost: 25,
    rates: { common: 74, rare: 20, epic: 5, legendary: 1 },
    guaranteedInterval: 5,
    guaranteedFloor: 'rare',
    softPityStart: 20,
    softPityStep: 0.6,
    hardPity: 35,
    accent: 'from-amber-700 to-amber-900',
  },
  {
    id: 'crystal',
    name: 'Crystal Chest',
    icon: '💎',
    sparkleCost: 90,
    gemCost: 40,
    rates: { common: 55, rare: 30, epic: 12, legendary: 3 },
    guaranteedInterval: 10,
    guaranteedFloor: 'epic',
    softPityStart: 10,
    softPityStep: 0.9,
    hardPity: 25,
    accent: 'from-cyan-600 to-blue-800',
  },
  {
    id: 'legacy',
    name: 'Legacy Chest',
    icon: '🏆',
    sparkleCost: 0, // gems-only
    gemCost: 400,
    rates: { common: 20, rare: 45, epic: 27, legendary: 8 },
    guaranteedInterval: 5,
    guaranteedFloor: 'epic',
    softPityStart: 5,
    softPityStep: 1.5,
    hardPity: 12,
    accent: 'from-fuchsia-600 to-purple-900',
  },
];

export const CHESTS_BY_ID = new Map(CHESTS.map((chest) => [chest.id, chest]));

/* -------------------------- Economy -------------------------- */

export const ECONOMY = {
  /** Daily login claim (POST /api/gacha/claim-daily); 20h gate. */
  dailyClaimAmount: 150,
  dailyClaimCooldownMs: 20 * 60 * 60 * 1000,
  /** Coin bonus when a quiz generation completes without failed chunks. */
  generateBonus: 10,
  /** Collectively owned items are finite, and duplicates auto-convert to gems,
   *  so a player's active inventory can never exceed ITEMS.length — the
   *  "inventory capacity" edge case is impossible by construction. */
} as const;

export const CURRENCIES = {
  sparkles: '✨',
  gems: '💎',
} as const;
