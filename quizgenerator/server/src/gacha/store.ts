import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CHESTS_BY_ID,
  ECONOMY,
  ITEMS_BY_ID,
  type Item,
} from './data.js';
import type { PityState } from './engine.js';
import { defaultRng, performPull, type Rng, type RolledDrop } from './engine.js';

/* ------------------------------------------------------------------ *
 * Player state. Single-process, in-memory (this app has no database —
 * same trade-off as the quiz queue). When GACHA_DATA_PATH is configured
 * the whole map is snapshotted to that JSON file with atomic tmp+rename
 * so a container restart keeps inventories.
 * ------------------------------------------------------------------ */

export interface Player {
  pid: string;
  sparkles: number;
  gems: number;
  /** Per-chest pity trackers. */
  pity: Record<string, PityState>;
  /** itemId -> count owned (duplicates beyond 1 were converted to gems). */
  owned: Record<string, number>;
  equippedItemId?: string;
  totalPulls: number;
  lifetimeGems: number;
  lastDailyClaim: number;
  createdAt: number;
}

export interface OpenResult {
  drops: RolledDrop[];
  player: PlayerSnapshot;
}

export type PlayerSnapshot = Omit<Player, 'pity'> & {
  pity: Record<string, PityState>;
};

export class ChestError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const PITY = () => ({ pullsSinceLegendary: 0, pullsSinceGuarantee: 0 });

export class GachaStore {
  private players = new Map<string, Player>();
  private rng: Rng = defaultRng();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private dataPath?: string) {
    if (dataPath) this.load();
  }

  /* ---------------- persistence ---------------- */

  private load(): void {
    const dataPath = this.dataPath;
    try {
      if (!dataPath || !fs.existsSync(dataPath)) return;
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as {
        players: Player[];
      };
      for (const player of raw.players || []) {
        // Heal missing fields so schema additions don't brick old snapshots.
        player.pity ||= {};
        player.owned ||= {};
        player.sparkles ||= 0;
        player.gems ||= 0;
        this.players.set(player.pid, player);
      }
    } catch (err: any) {
      console.warn(`Gacha store load failed (starting empty): ${err.message}`);
    }
  }

  private scheduleSave(): void {
    const dataPath = this.dataPath;
    if (!dataPath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        const tmp = `${dataPath}.tmp`;
        fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify({ players: [...this.players.values()] }));
        fs.renameSync(tmp, dataPath); // atomic swap
      } catch (err: any) {
        console.warn(`Gacha store save failed: ${err.message}`);
      }
    }, 1500);
    this.saveTimer.unref?.();
  }

  flushSync(): void {
    const dataPath = this.dataPath;
    if (!dataPath) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const tmp = `${dataPath}.tmp`;
      fs.mkdirSync(path.dirname(dataPath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ players: [...this.players.values()] }));
      fs.renameSync(tmp, dataPath);
    } catch (err: any) {
      console.warn(`Gacha store flushSync failed: ${err.message}`);
    }
  }

  /* ---------------- identity & reads ---------------- */

  getOrCreatePlayer(pid: string): Player {
    let player = this.players.get(pid);
    if (!player) {
      player = {
        pid,
        sparkles: ECONOMY.dailyClaimAmount > 0 ? 60 : 0, // small starter balance
        gems: 0,
        pity: {},
        owned: {},
        totalPulls: 0,
        lifetimeGems: 0,
        lastDailyClaim: 0,
        createdAt: Date.now(),
      };
      this.players.set(pid, player);
      this.scheduleSave();
    }
    return player;
  }

  hasPlayer(pid: string): boolean {
    return this.players.has(pid);
  }

  snapshot(player: Player): PlayerSnapshot {
    return { ...player, pity: { ...player.pity } };
  }

  getPity(player: Player, chestId: string): PityState {
    return (player.pity[chestId] ||= PITY());
  }

  /* ---------------- mutations (all fall inside one sync block) ---------------- */

  grantClaimDaily(player: Player): { granted: number; nextClaimAt: number } {
    const now = Date.now();
    if (now - player.lastDailyClaim < ECONOMY.dailyClaimCooldownMs) {
      throw new ChestError(
        429,
        'DAILY_COOLDOWN',
        `Daily gems already claimed — next in ${Math.ceil(
          (ECONOMY.dailyClaimCooldownMs - (now - player.lastDailyClaim)) / 60000
        )} min.`
      );
    }
    player.lastDailyClaim = now;
    player.sparkles += ECONOMY.dailyClaimAmount;
    this.scheduleSave();
    return { granted: ECONOMY.dailyClaimAmount, nextClaimAt: now + ECONOMY.dailyClaimCooldownMs };
  }

  /** Public hook for other routes (e.g. generate bonus coins). Never throws. */
  grant(player: Player, amount: number): void {
    player.sparkles += amount;
    this.scheduleSave();
  }

  /**
   * Debits currency, performs `qty` pulls atomically (synchronous block — no
   * interleaving possible in the single-threaded event loop) and mutates pity,
   * owned items and currencies. Throws ChestError *before* any state changes
   * when the request is invalid, so failures never half-spend.
   */
  open(
    player: Player,
    chestId: string,
    qty: 1 | 10,
    currency: 'sparkles' | 'gems',
    rng: Rng = this.rng
  ): OpenResult {
    const chest = CHESTS_BY_ID.get(chestId);
    if (!chest) {
      throw new ChestError(400, 'UNKNOWN_CHEST', `Unknown chest: ${chestId}`);
    }
    if (qty !== 1 && qty !== 10) {
      throw new ChestError(400, 'BAD_QTY', 'Only 1 or 10 pulls are supported.');
    }

    // Decide currency + price BEFORE touching state.
    const priceSparkles = chest.sparkleCost * qty;
    const priceGems = (chest.gemCost ?? Infinity) * qty;
    if (currency === 'sparkles') {
      if (priceSparkles <= 0) {
        throw new ChestError(400, 'CURRENCY_UNAVAILABLE', `${chest.id} cannot be bought with sparkles.`);
      }
    } else {
      if (!chest.gemCost) {
        throw new ChestError(400, 'CURRENCY_UNAVAILABLE', `${chest.name} cannot be bought with gems.`);
      }
    }

    if (currency === 'sparkles') {
      if (player.sparkles < priceSparkles) {
        throw new ChestError(
          402,
          'INSUFFICIENT_SPARKLES',
          `Not enough sparkles: need ${priceSparkles}, have ${player.sparkles}.`
        );
      }
    } else if (player.gems < priceGems) {
      throw new ChestError(402, 'INSUFFICIENT_GEMS', `Not enough gems: need ${priceGems}, have ${player.gems}.`);
    }

    // --- State mutations start here (atomic in the event loop) ---
    if (currency === 'sparkles') player.sparkles -= priceSparkles;
    else player.gems -= priceGems;

    const pity = this.getPity(player, chestId);
    const drops: RolledDrop[] = [];
    for (let i = 0; i < qty; i++) {
      const drop = performPull(chestId, pity, player.owned, rng);
      if (drop.duplicate) {
        player.gems += drop.gemsAwarded;
        player.lifetimeGems += drop.gemsAwarded;
      } else {
        player.owned[drop.item.id] = (player.owned[drop.item.id] || 0) + 1;
        player.equippedItemId ||= drop.item.id; // auto-equip first cosmetic
      }
      drops.push(drop);
    }
    player.totalPulls += qty;
    this.scheduleSave();

    return { drops, player: this.snapshot(player) };
  }

  /** Equip an owned cosmetic (the "redeem" action). */
  equip(player: Player, itemId: string): { item: Item } {
    const item = ITEMS_BY_ID.get(itemId);
    if (!item) throw new ChestError(404, 'UNKNOWN_ITEM', `Unknown item: ${itemId}`);
    if (!player.owned[itemId]) {
      throw new ChestError(403, 'NOT_OWNED', 'You do not own that item yet.');
    }
    player.equippedItemId = itemId;
    this.scheduleSave();
    return { item };
  }

  /* ---------------- test helpers ---------------- */

  setRngForTests(rng: Rng): void {
    this.rng = rng;
  }

  resetForTests(): void {
    this.players.clear();
  }
}

/* Cookie identity: pid.HMAC(pid, secret) — unforgeable without the secret. */

export function parseSignedPid(cookie: string | undefined, secret: string): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return null;
  const pid = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = signPid(pid, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!/^[a-f0-9-]{36}$/.test(pid)) return null;
  return pid;
}

export function signPid(pid: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(pid).digest('base64url');
}

export function newPid(): string {
  return crypto.randomUUID();
}
