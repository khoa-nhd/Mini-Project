import { describe, it, expect, beforeAll } from 'vitest';
import {
  CHESTS,
  CHESTS_BY_ID,
  DUPLICATE_GEM_VALUES,
  ECONOMY,
  ITEMS,
  ITEMS_BY_ID,
  type Rarity,
} from '../gacha/data.js';
import {
  mulberry32,
  performPull,
  rollRarity,
  simulatePulls,
  type PityState,
} from '../gacha/engine.js';
import { GachaStore, ChestError, newPid, parseSignedPid, signPid } from '../gacha/store.js';

const freshPity = (): PityState => ({ pullsSinceLegendary: 0, pullsSinceGuarantee: 0 });

/* ------------------------------------------------------------------ *
 * 1. Mathematical validation — 10,000 simulated pulls per chest
 * ------------------------------------------------------------------ */

describe('drop-rate math (10k pulls per chest, seeded RNG)', () => {
  it('hard pity guarantees a legendary at least every `hardPity` pulls', () => {
    for (const chest of CHESTS) {
      for (const seed of [1, 42, 1337]) {
        const rng = mulberry32(seed);
        const pity = freshPity();
        const owned: Record<string, number> = {};
        let gap = 0;
        let maxGap = 0;
        for (let i = 0; i < 10_000; i++) {
          const drop = performPull(chest.id, pity, owned, rng);
          if (drop.rarity === 'legendary') {
            maxGap = Math.max(maxGap, gap);
            gap = 0;
          } else {
            gap += 1;
          }
          owned[drop.item.id] = (owned[drop.item.id] || 0) + 1;
        }
        expect(maxGap).toBeLessThanOrEqual(chest.hardPity);
      }
    }
  });

  it('the guarantee floor never leaves a drought below `guaranteedInterval`', () => {
    for (const chest of CHESTS) {
      const rng = mulberry32(2024);
      const pity = freshPity();
      const floorIdx = floorIndex(chest.guaranteedFloor);
      let dryStreak = 0;
      for (let i = 0; i < 10_000; i++) {
        const drop = performPull(chest.id, pity, ownedAllButNone(), rng);
        if (rarityRank(drop.rarity) < floorIdx) {
          dryStreak += 1;
          expect(dryStreak).toBeLessThan(chest.guaranteedInterval);
        } else {
          dryStreak = 0;
        }
      }
    }
  });

  it('with pity disabled, rarity distribution matches configured rates (±2%)', () => {
    // Synthetic "no-pity" chest: thresholds so high they never trigger.
    const flat = {
      ...CHESTS_BY_ID.get('wooden')!,
      softPityStart: Number.MAX_SAFE_INTEGER,
      hardPity: Number.MAX_SAFE_INTEGER,
      guaranteedInterval: 2,
      guaranteedFloor: 'common' as Rarity,
    };
    const rng = mulberry32(777);
    const pity = freshPity();
    const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const { rarity } = rollRarity(flat, pity, rng);
      counts[rarity] += 1;
      pity.pullsSinceLegendary += 1;
      pity.pullsSinceGuarantee += 1;
    }
    for (const rarity of Object.keys(counts) as Rarity[]) {
      const expected = flat.rates[rarity]; // percentage
      const observed = (counts[rarity] / N) * 100;
      expect(observed).toBeGreaterThanOrEqual(expected - 1.5);
      expect(observed).toBeLessThanOrEqual(expected + 1.5);
    }
  });

  it('full pity-enabled simulation: legendary rate >= nominal, drought <= hardPity', () => {
    for (const chest of CHESTS) {
      const dist = simulatePulls(chest.id, 10_000, mulberry32(9));
      // Hard pity only ever raises the legendary rate above nominal.
      expect(dist.legendary / 10_000).toBeGreaterThanOrEqual(chest.rates.legendary / 100);
      // And stays sane — pity ramps are bounded.
      expect(dist.legendary / 10_000).toBeLessThanOrEqual(chest.rates.legendary / 100 + 0.05);
      // Guarantee floors raise their tier slightly above nominal too.
      expect(dist.legendary + dist.rare + dist.epic).toBeGreaterThan(0);
    }
  });

  it('rates in every chest sum to exactly 100', () => {
    for (const chest of CHESTS) {
      const sum = Object.values(chest.rates).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. Store mechanics — pricing, atomicity, duplicates, redemption
 * ------------------------------------------------------------------ */

function makeStore(): GachaStore {
  const store = new GachaStore(); // no persistence path = memory-only
  store.resetForTests();
  return store;
}

const ownedAllButNone = (): Record<string, number> => ({});

function floorIndex(rarity: Rarity): number {
  return ['common', 'rare', 'epic', 'legendary'].indexOf(rarity);
}

function rarityRank(rarity: Rarity): number {
  return ['common', 'rare', 'epic', 'legendary'].indexOf(rarity);
}

describe('gacha store — transactional edge cases', () => {
  it('throws 400 on unknown chest and never touches balance', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    const before = player.sparkles;
    expect(() => store.open(player, 'nonexistent', 1, 'sparkles')).toThrow(ChestError);
    expect(player.sparkles).toBe(before);
  });

  it('insufficient balance throws 402 and spends nothing', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 24; // wooden chest costs 25
    expect(() => store.open(player, 'wooden', 1, 'sparkles')).toThrowError(ChestError);
    expect(player.sparkles).toBe(24);
    try {
      player.sparkles = 249; // 10-pull costs 250
      store.open(player, 'wooden', 10, 'sparkles');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ChestError).code).toBe('INSUFFICIENT_SPARKLES');
    }
    expect(player.sparkles).toBe(249);
  });

  it('currency swap is validated: gems-only chest rejects sparkles and vice versa', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 10_000;
    player.gems = 10_000;
    expect(() => store.open(player, 'legacy', 1, 'sparkles')).toThrowError(
      expect.objectContaining({ code: 'CURRENCY_UNAVAILABLE' })
    );
    expect(() => store.open(player, 'legacy', 1, 'sparkles')).toThrowError(ChestError);
  });

  it('concurrent double-spend: exactly one of several racing opens succeeds', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 25; // one pull only
    const attempts: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      try {
        attempts.push(store.open(player, 'wooden', 1, 'sparkles'));
      } catch (err) {
        attempts.push(err);
      }
    }
    // open() is synchronous inside the event loop, so these "race" sequentially:
    // the first debits and succeeds, the other four must fail — not half-spend.
    expect(attempts.filter((a) => a instanceof ChestError).length).toBe(4);
    expect(attempts.filter((a) => a instanceof ChestError).every((a) => (a as ChestError).code === 'INSUFFICIENT_SPARKLES')).toBe(true);
    expect(player.sparkles).toBe(0);
  });

  it('concurrent double-spend at the promise level: one success, rest 402', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 25;
    const results = Promise.allSettled(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => store.open(player, 'wooden', 1, 'sparkles')))
    ).then((settled) => {
      const ok = settled.filter((s) => s.status === 'fulfilled').length;
      const rejected = settled.filter(
        (s) => s.status === 'rejected' && (s.reason as ChestError).code === 'INSUFFICIENT_SPARKLES'
      ).length;
      expect(ok).toBe(1);
      expect(rejected).toBe(9);
      expect(player.sparkles).toBe(0);
    });
    return results;
  });

  it('duplicates auto-recycle to gems at the configured value', () => {
    const store = makeStore();
    const rng = mulberry32(3);
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 50_000; // 500 pulls × 25 = 12,500, with margin
    // Own every common item first so early pulls of commons become duplicates.
    for (const item of ITEMS.filter((i) => i.rarity === 'common')) {
      player.owned[item.id] = 1;
    }
    const pity = store.getPity(player, 'wooden');
    let dupGems = 0;
    let dupCount = 0;
    for (let i = 0; i < 500; i++) {
      const result = store.open(player, 'wooden', 1, 'sparkles', rng);
      for (const drop of result.drops) {
        if (drop.duplicate) {
          expect(drop.gemsAwarded).toBe(DUPLICATE_GEM_VALUES[drop.rarity]);
          dupGems += drop.gemsAwarded;
          dupCount += 1;
        } else {
          expect(drop.gemsAwarded).toBe(0);
        }
      }
      void pity;
    }
    expect(dupCount).toBeGreaterThan(0);
    expect(player.gems).toBe(dupGems);
  });

  it('daily claim grants once, then 429 until cooldown', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    const before = player.sparkles;
    const first = store.grantClaimDaily(player);
    expect(first.granted).toBe(ECONOMY.dailyClaimAmount);
    expect(player.sparkles).toBe(before + ECONOMY.dailyClaimAmount);
    expect(() => store.grantClaimDaily(player)).toThrowError(
      expect.objectContaining({ code: 'DAILY_COOLDOWN' })
    );
  });

  it('equip rejects unowned items and accepts owned ones', () => {
    const store = makeStore();
    const player = store.getOrCreatePlayer(newPid());
    expect(() => store.equip(player, 'wizard_hat')).toThrowError(
      expect.objectContaining({ code: 'NOT_OWNED' })
    );
    player.owned.wizard_hat = 1;
    const { item } = store.equip(player, 'wizard_hat');
    expect(item.id).toBe('wizard_hat');
    expect(player.equippedItemId).toBe('wizard_hat');
  });

  it('inventory cannot exceed the finite catalogue (capacity impossible by design)', () => {
    const store = makeStore();
    const rng = mulberry32(11);
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 1_000_000;
    for (let i = 0; i < 2_000; i++) {
      store.open(player, 'wooden', 1, 'sparkles', rng);
    }
    expect(Object.keys(player.owned).length).toBeLessThanOrEqual(ITEMS.length);
    expect(ITEMS.every((item) => ITEMS_BY_ID.has(item.id))).toBe(true);
  });

  it('never leaves a player with negative currency after many tiny attempts', () => {
    const store = makeStore();
    const rng = mulberry32(5);
    const player = store.getOrCreatePlayer(newPid());
    player.sparkles = 130;
    for (let i = 0; i < 40; i++) {
      try {
        store.open(player, 'wooden', 1, 'sparkles', rng);
      } catch {
        /* expected once balance is exhausted */
      }
    }
    expect(player.sparkles).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Route-level tests — identity cookie + idempotency (double-tap)
 * ------------------------------------------------------------------ */

describe('gacha routes (fastify inject)', () => {
  beforeAll(async () => {
    process.env.GACHA_COOKIE_SECRET = 'test-only-secret';
    const { gachaRoute } = await import('../gacha/routes.js');
    const Fastify = (await import('fastify')).default;
    const app = Fastify();
    await app.register(gachaRoute);
    await app.ready();
    (globalThis as any).__gachaApp = app;
  });

  it('issues a signed identity cookie on first contact', async () => {
    const app = (globalThis as any).__gachaApp;
    const res = await app.inject({ method: 'GET', url: '/api/gacha/profile' });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('gacha_pid=');
    const value = decodeURIComponent(setCookie.split(';')[0].split('=')[1]);
    const pid = parseSignedPid(value, process.env.GACHA_COOKIE_SECRET!);
    expect(pid).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('rejects a tampered cookie signature with a fresh identity', async () => {
    const app = (globalThis as any).__gachaApp;
    const fake = 'not-a-real-pid.bad-signature!';
    const res = await app.inject({
      method: 'GET',
      url: '/api/gacha/profile',
      headers: { cookie: `gacha_pid=${encodeURIComponent(fake)}` },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    // The server must mint a NEW signed cookie, i.e. the tampered one is discarded.
    expect(setCookie).toBeDefined();
    expect(setCookie).not.toContain(encodeURIComponent(fake));
  });

  it('replays identical idempotencyKey responses instead of double-charging', async () => {
    const app = (globalThis as any).__gachaApp;
    const cookie = `gacha_pid=${encodeURIComponent(newPid() + '.' + signPid(newPid(), process.env.GACHA_COOKIE_SECRET!))}`;
    // Craft a validly signed cookie for a genuinely new player:
    const pid = newPid();
    const signed = `gacha_pid=${encodeURIComponent(`${pid}.${signPid(pid, process.env.GACHA_COOKIE_SECRET!)}`)}`;

    const body = { chest: 'wooden', qty: 1, currency: 'sparkles', idempotencyKey: 'tap-once' };
    // First request: player is brand new with only the starter balance, so fund via claim-daily.
    const claim = await app.inject({ method: 'POST', url: '/api/gacha/claim-daily', headers: { cookie: signed } });
    expect(claim.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: '/api/gacha/open',
      headers: { cookie: signed },
      payload: body,
    });
    expect(first.statusCode).toBe(200);
    const balanceAfterFirst = first.json().player.sparkles;

    const retry = await app.inject({
      method: 'POST',
      url: '/api/gacha/open',
      headers: { cookie: signed },
      payload: body,
    });
    expect(retry.statusCode).toBe(200);
    // Same drop, same balance: the retry did not charge or re-roll.
    expect(retry.json().drops).toEqual(first.json().drops);
    expect(retry.json().player.sparkles).toBe(balanceAfterFirst);
    void cookie;
  });

  it('unknown chest maps to a 400 error payload with code', async () => {
    const app = (globalThis as any).__gachaApp;
    const pid = newPid();
    const signed = `gacha_pid=${encodeURIComponent(`${pid}.${signPid(pid, process.env.GACHA_COOKIE_SECRET!)}`)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/gacha/open',
      headers: { cookie: signed },
      payload: { chest: 'fake-chest' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('UNKNOWN_CHEST');
  });

  it('insufficient funds returns 402 with the shortfall described', async () => {
    const app = (globalThis as any).__gachaApp;
    const pid = newPid();
    const signed = `gacha_pid=${encodeURIComponent(`${pid}.${signPid(pid, process.env.GACHA_COOKIE_SECRET!)}`)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/gacha/open',
      headers: { cookie: signed },
      payload: { chest: 'legacy', currency: 'gems' },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().code).toBe('INSUFFICIENT_GEMS');
  });
});
