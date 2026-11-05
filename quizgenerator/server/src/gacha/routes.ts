import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  CHESTS,
  ECONOMY,
  ITEMS,
  RARITY_ORDER,
  type ChestConfig,
} from './data.js';
import { GachaStore, newPid, parseSignedPid, signPid, ChestError } from './store.js';

export const GACHA_COOKIE = 'gacha_pid';

/**
 * Module-level runtime: Fastify plugin scopes are encapsulated, but other
 * routes (e.g. the generate coin bonus) need access to the same store, so the
 * runtime lives at module scope instead of on a decorated instance.
 *
 * Cookie secret: env-configured in production (GACHA_COOKIE_SECRET); without
 * it, a per-boot random secret keeps identities ephemeral in local dev.
 */
export function gachaCookieSecret(): string {
  if (process.env.GACHA_COOKIE_SECRET) return process.env.GACHA_COOKIE_SECRET;
  return newPid().replace(/-/g, '') + newPid().replace(/-/g, '').slice(0, 16);
}

export interface GachaRuntime {
  store: GachaStore;
  secret: string;
}

export const gachaRuntime: GachaRuntime = {
  store: new GachaStore(process.env.GACHA_DATA_PATH),
  secret: gachaCookieSecret(),
};

/**
 * Best-effort pid lookup for routes that already flushed their headers (e.g.
 * SSE): returns the signed-cookie pid when one exists, never creates one.
 */
export function tryResolvePid(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq).trim() !== GACHA_COOKIE) continue;
    return parseSignedPid(decodeURIComponent(pair.slice(eq + 1).trim()), gachaRuntime.secret);
  }
  return null;
}

/** Grants reward coins from any other route. Never throws. */
export function grantGachaCoins(pid: string, amount: number): void {
  try {
    const player = gachaRuntime.store.getOrCreatePlayer(pid);
    gachaRuntime.store.grant(player, amount);
  } catch (err: any) {
    console.warn(`Gacha grant failed: ${err.message}`);
  }
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === name) return decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return undefined;
}

function resolvePlayer(request: FastifyRequest, reply: FastifyReply, gacha: GachaRuntime) {
  const cookie = readCookie(request, GACHA_COOKIE);
  let pid = parseSignedPid(cookie, gacha.secret);
  if (!pid) {
    pid = newPid();
    const value = `${pid}.${signPid(pid, gacha.secret)}`;
    const attrs = [
      `${GACHA_COOKIE}=${encodeURIComponent(value)}`,
      'Path=/',
      'Max-Age=7776000',
      'HttpOnly',
      'SameSite=Lax',
      ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
    ];
    reply.header('Set-Cookie', attrs.join('; '));
  }
  return gacha.store.getOrCreatePlayer(pid);
}

/** Public catalog projection — rates are shown honestly (they already sum to 100). */
function chestProjection(chest: ChestConfig) {
  return {
    id: chest.id,
    name: chest.name,
    icon: chest.icon,
    sparkleCost: chest.sparkleCost,
    gemCost: chest.gemCost ?? null,
    rates: RARITY_ORDER.map((rarity) => ({
      rarity,
      percent: chest.rates[rarity],
    })),
    guaranteedInterval: chest.guaranteedInterval,
    guaranteedFloor: chest.guaranteedFloor,
    hardPity: chest.hardPity,
    accent: chest.accent,
  };
}

export const gachaRoute: FastifyPluginAsync = async (server) => {
  const runtime = gachaRuntime;

  server.addHook('onClose', async () => runtime.store.flushSync());

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ChestError) {
      reply.status(error.statusCode).send({ error: error.message, code: error.code });
      return;
    }
    throw error;
  });

  // --- Catalog + profile (cheap, no rate limit needed) ---

  server.get('/api/gacha/chests', async () => ({
    chests: CHESTS.map(chestProjection),
    items: ITEMS.map(({ id, name, rarity, icon, blurb }) => ({ id, name, rarity, icon, blurb })),
    economy: {
      dailyClaimAmount: ECONOMY.dailyClaimAmount,
      generateBonus: ECONOMY.generateBonus,
    },
  }));

  server.get('/api/gacha/profile', async (request, reply) => {      const player = resolvePlayer(request, reply, gachaRuntime);
    const now = Date.now();
    return {
      player: runtime.store.snapshot(player),
      daily: {
        amount: ECONOMY.dailyClaimAmount,
        canClaim: now - player.lastDailyClaim >= ECONOMY.dailyClaimCooldownMs,
        nextClaimAt: player.lastDailyClaim + ECONOMY.dailyClaimCooldownMs,
      },
      chests: CHESTS.map((chest) => {
        const pity = runtime.store.getPity(player, chest.id);
        return {
          id: chest.id,
          pullsSinceLegendary: pity.pullsSinceLegendary,
          pullsSinceGuarantee: pity.pullsSinceGuarantee,
          pullsUntilHardPity: Math.max(0, chest.hardPity - pity.pullsSinceLegendary),
          pullsUntilGuarantee: Math.max(0, chest.guaranteedInterval - 1 - pity.pullsSinceGuarantee),
        };
      }),
    };
  });

  // --- Earning ---

  server.post(
    '/api/gacha/claim-daily',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const player = resolvePlayer(request, reply, runtime);
      const result = runtime.store.grantClaimDaily(player);
      return { ...result, sparkles: player.sparkles };
    }
  );

  // --- Opening (server-authoritative; the client only animates results) ---
  // IdempotencyKey: a retried request (network timeout, double-tap) replays
  // the original result for the same player instead of charging again.

  server.post(
    '/api/gacha/open',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = (request.body || {}) as {
        chest?: string;
        qty?: number;
        currency?: 'sparkles' | 'gems';
        idempotencyKey?: string;
      };
      const player = resolvePlayer(request, reply, runtime);
      const key = String(body.idempotencyKey || '');
      if (key) {
        const cacheKey = `${player.pid}:${key}`;
        const cached = idempotencyCache.get(cacheKey);
        if (cached) {
          reply.status(200).send(cached);
          return;
        }
      }

      const chest = String(body.chest || '');
      const currency = body.currency === 'gems' ? 'gems' : 'sparkles';
      const qty = body.qty === 10 ? 10 : 1;
      const result = runtime.store.open(player, chest, qty, currency);
      const payload = {
        drops: result.drops,
        player: result.player,
        chest: chestProjection(CHESTS.find((c) => c.id === chest)!),
      };
      if (key) {
        const cacheKey = `${player.pid}:${key}`;
        idempotencyCache.set(cacheKey, payload);
        setTimeout(() => idempotencyCache.delete(cacheKey), 5 * 60 * 1000).unref?.();
      }
      reply.send(payload);
    }
  );

  // --- Redeem (equip cosmetics) ---

  server.post(
    '/api/gacha/equip',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const player = resolvePlayer(request, reply, runtime);
      const body = (request.body || {}) as { itemId?: string };
      const { item } = runtime.store.equip(player, String(body.itemId || ''));
      return { equippedItemId: item.id };
    }
  );

};

const idempotencyCache = new Map<string, unknown>();
