# Loot Chest & Gacha System — Design & QA Guide

Full-stack gacha system for Quiz Generator: psychologically tuned reward experience with provably fair, server-authoritative drop math.

**Stack:** Node + Fastify 5 (server-authoritative engine) · React 19 + Tailwind 4 (UI) · WebAudio-synthesized sound · pure CSS/Framer-free animation pipeline (zero new dependencies).

---

## 1. Architecture

```
Browser                         Server (Fastify, single source of truth)
───────                         ───────────────────────────────────────
GachaModal.tsx  ──GET /chests──▶ data.ts projections (rates disclosed)
   │           ──GET /profile──▶ balances + per-chest pity state
   │
   │ "Open ×1/×10"  ──POST /open──▶ GachaStore.open() [atomic sync block]:
   │                                  validate chest/qty/currency
   │                                  check balance BEFORE mutations
   │                                  debit → roll rarity (pity-aware)
   │                                  → roll item → recycle duplicates
   │     (results arrive BEFORE    returns drops + new snapshot —
   │      any animation plays)     client only *presents* facts
```

Everything that must not be client-manipulated is server-side: prices, balances, rolls, pity counters, duplicate recycling, daily claim timestamps. The browser has no endpoint where it can state "I got a legendary."

### Files

| Area | File | Role |
|---|---|---|
| Server | `server/src/gacha/data.ts` | Chests, items, rates, pity config, gem table, economy constants — single source of truth |
| Server | `server/src/gacha/engine.ts` | Weighted random + soft/hard pity + guarantee flow; seeded `" mulberry32"` for replayable tests |
| Server | `server/src/gacha/store.ts` | Player map, atomic `open()` (validate-then-mutate, one sync block), signed-cookie identity, optional JSON persistence (`GACHA_DATA_PATH`) |
| Server | `server/src/gacha/routes.ts` | 5 endpoints, error-code mapping, idempotency cache, rate limits |
| Server hook | `server/src/routes/generate.ts` | +✨10 reward on fully successful generation (existing players only — SSE headers are flushed so new identities can't mint mid-stream) |
| Web | `web/src/gacha/GachaModal.tsx` | State machine: catalog → opening → reveal → summary; collection/equip |
| Web | `web/src/gacha/ParticleBurst.tsx` | GPU-composited CSS particle bursts, density scaled by rarity (cap 30) |
| Web | `web/src/gacha/sound.ts` | WebAudio-synthesized cues — zero audio assets |
| Web | `web/src/index.css` | All animation keyframes (transform/opacity only) |
| Tests | `server/src/__tests__/gacha.test.ts` | 20+ tests incl. 10k-pull distribution validation + route double-spend/idempotency |

### API

| Method & path | Body | Behaviour |
|---|---|---|
| `GET /api/gacha/chests` | — | Catalog + true odds + item defs (no auth material needed) |
| `GET /api/gacha/profile` | — | Balances, pity progress per chest, daily-claim availability; mints signed identity cookie |
| `POST /api/gacha/claim-daily` | — | +✨150, rate-limited 10/min, server-side 20h cooldown |
| `POST /api/gacha/open` | `{chest, qty:1\|10, currency:'sparkles'\|'gems', idempotencyKey}` | Debits, rolls, returns drops + snapshot. 30/min. 400/402/error-code on failure |
| `POST /api/gacha/equip` | `{itemId}` | Equip an owned cosmetic (redeem action). 403 if not owned |

Identity = `gacha_pid` HttpOnly cookie containing `pid.HMAC(pid, secret)`, verified with `crypto.timingSafeEqual`; 90-day lifetime; `Secure` in production. Tampered or stale cookies are discarded (a fresh one is minted). Set `GACHA_COOKIE_SECRET` in production so identities survive redeploys.

### Data model (in-memory, JSON snapshot optional)

```ts
Player {
  pid: string
  sparkles: number           // earned currency (generate bonus, daily claim)
  gems: number               // duplicate-recycled currency, buys crystal/legacy
  pity: Record<chestId, { pullsSinceLegendary, pullsSinceGuarantee }>
  owned: Record<itemId, 1>   // duplicates beyond the first auto-convert to gems
  equippedItemId?: string
  totalPulls, lifetimeGems, lastDailyClaim, createdAt
}
```

**Inventory capacity is impossible to overflow by construction:** the catalog is finite (19 items) and duplicates never pile into `owned` — they convert to gems. Capacity edge cases degenerate gracefully.

There is no SQL database in this app (same trade-off as the quiz queue), so persistence is a whole-map JSON snapshot via `GACHA_DATA_PATH` with `tmp + rename` atomicity, debounced 1.5 s and flushed on server close.

---

## 2. The math (and why it feels fair)

### Drop resolution order (per pull)

1. **Hard pity** — pity `pullsSinceLegendary >= hardPity` ⇒ legendary. Droughts can never exceed the cap.
2. **Guarantee floor** — anti-frustration: every `guaranteedInterval` pulls without reaching `guaranteedFloor` forces that tier.
3. **Soft pity** — from `softPityStart` of the legendary drought, each failed pull adds `softPityStep` percentage points, shifted *out of the lower tiers* into legendary so probabilities still sum to exactly 100.
4. Otherwise: flat weighted pick over the exact published rates.

### Configured tables (all sums = 100)

| Chest | Cost | Common | Rare | Epic | Legendary | Floor every | Hard pity | Soft pity |
|---|---|---|---|---|---|---|---|---|
| Wooden 📦 | ✨25 | 74 | 20 | 5 | 1 | 5 → Rare+ | 35 | +0.6%/pull from 20 |
| Crystal 💎 | ✨90 or 💎40 | 55 | 30 | 12 | 3 | 10 → Epic+ | 25 | +0.9%/pull from 10 |
| Legacy 🏆 | 💎400 only | 20 | 45 | 27 | 8 | 5 → Epic+ | 12 | +1.5%/pull from 5 |

Duplicate recycling: Common→💎2, Rare→💎8, Epic→💎30, Legendary→💎150. Gems are spendable (Crystal/Legacy), so *no pull is ever a total loss* — the anti-frustration backbone.

### Earn loop

+✨150/day (20h gate) · +✨10 per fully successful quiz generation · +✨60 starter balance for new players. A ~~100 ✨ player has ~4 wooden opens or a 10-pull every ~7 days without generating; generating drives it up fast.

## 3. Psychology & engagement design

| Mechanic | Where | Why it works |
|---|---|---|
| **Escalating build-up** | `buildUpMs()` scales a 0.9s→3.2s shake with the *best* pull in the batch; seam shake ticks rise in pitch | anticipation window itself encodes stakes ("longer shake = bigger prize"), the same curve slot machines use |
| **Rarity-marked fanfares** | `sfx.reveal()` — 1-note pop → 2-note rise → 4-note arpeggio → 5-note legendary fanfare with sub-swell + shimmer | ascending musical promise-loop; players *predict the rarity before reading the card* |
| **Tension delay on legendaries** | 2.4 s reveal dwell + 0.4 s×2 screen quake + rotating golden beam | peak-end rule: the peak moment is deliberately drawn out |
| **Visibility of fairness** | odds bars + pity countdown ("Legend in ≤ N") on every chest | Ygora-curve mitigation: visible pity turns a cold streak into a *promise*, not a suspicion |
| **Pity pulse** | legend countdown turns amber and pulses at ≤3 remaining | near-miss proximity spikes return visits |
| **Duplicate → gems** | auto-conversion + 💎 badge inline | no dead losses; refunds feel like a feature, not a failure |
| **Skip button** | space key exact parity with the skip control during build-up | respect for the 2% who only want the reward; protects dopamine curve from being *forced* |
| **10x summary grid** | one card grid w/ NEW + 💎 badges, "Again ×10" one-tap | variable-ratio reinforcement with a fast second dose |
| **Mute switch** | WebAudio, gain-limited to 0.35 | engaging ≠ annoying; respect upkeep of goodwill |

## 4. Anti-cheat checklist

Currency cheat attempts all fail server-side:

- Prices are derived in `GachaStore.open()`, never from the request, beyond `chest/qty/currency` selectors; `qty` is coerced to {1,10}.
- Balance check happens **before any mutation** and insufficient funds throw a typed `ChestError(402)` — nothing half-spends.
- `open()` is a synchronous block in the single-threaded event loop ⇒ no two requests interleave inside a debit+roll.
- Idempotency: retried `open` with the same `idempotencyKey` + pid replays the cached payload (5 min TTL) — double-taps and network retries don't double-charge.
- Cookies are HMAC-signed; forgeries fail `timingSafeEqual` and are re-minted (net loss to the cheater: their inventory).
- Rate limits: open 30/min, daily-claim 10/min per IP (via the shared `trustProxy` + Caddy `X-Forwarded-For` infra).
- Client never sends drop tables or RNG values — it only renders the response.

## 5. QA — edge cases (tested in `gacha.test.ts`)

| Edge case | Test | Expected |
|---|---|---|
| Unknown chest | 400 `UNKNOWN_CHEST`, balance untouched |
| Insufficient currency | 402 `INSUFFICIENT_*`, no partial debit after 4 attempts |
| Wrong currency for chest | 400 `CURRENCY_UNAVAILABLE` (gems-only legacy rejects sparkles) |
| Concurrent double-spend | One success, four 402s, balance lands exactly at 0 |
| Idempotent retry | Cached payload replay, balance/drops identical |
| Tampered cookie | New signed identity minted, old state orphaned |
| Daily double-claim | First grants; second 429 `DAILY_COOLDOWN` |
| Equip unowned | 403 `NOT_OWNED` |
| Inventory overflow | Impossible: owned set ≤ 19-item catalogue after 2,000 pulls |
| Death spiral drain | 40 attempted opens end with `sparkles >= 0` (never negative) |
| Network drop mid-open | Server completed the debit+roll; retry with same key replays — no lost seals, no double-charge |

## 6. QA — mathematical validation

`drop-rate math (10k...)` suite (seeded `mulberry32`, 3 seeds × 3 chests):

- **Drought cap:** max legendary gap ≤ `hardPity` across 10,000 pulls × 3 seeds × 3 chests.
- **Guarantee floor:** below-floor dry streaks strictly `< guaranteedInterval`.
- **Odds honesty (pity disabled):** every rarity within ±1.5 percentage points of the configured rate over 10,000 pulls.
- **Full pity-enabled sim:** legendary rate ∈ [nominal, nominal + 5%] (pity only ever lifts it).
- **Exactness:** all rate tables sum to exactly 100.

## 7. QA — performance budget (animation)

Design constraints baked in:

1. **Transform/opacity only.** Every keyframe (`gacha-burst`, `gacha-pop`, `gacha-shake`, `gacha-beam`, `gacha-quake`) animates compositor-friendly properties — no width/height/top/left, no layout reflow.
2. **Bounded DOM churn.** Burst particles count ≤ 30 span nodes, one fragment per reveal — guaranteed-apart by `burstKey`, so old particles unmount.
3. **No canvas / WebGL cost.** Absent entirely; also no framer-motion re-render storm — reveal cards are state-machine phase switches, not continuous positions.
4. **Sound budget:** 12 oscillators max per fanfare, single lazily-created `AudioContext`, gain 0.35.

Manual verification checklist (DevTools → Performance):

- [ ] Desktop Chrome: unlock → reveal at 60 FPS (frame time < 16.7 ms; burst peak is the only spike).
- [ ] Mobile Safari / Android Chrome mid-range: burst peak ≥ 45 FPS, no dropped shake frames.
- [ ] Memory: 3 consecutive 10x opens add no detached-particle retention (Heap snapshot diff ≤ 1 MB).
- [ ] `AudioContext` count stays at exactly 1 across sessions (Chrome → Media inspector).
- [ ] Reduced-motion OS setting: shake/quake sequences still feel close to conformant (honor via `prefers-reduced-motion` media query is a future item).

## 8. Known limitations & future work

- **Process memory:** player state is per-process; multi-container scaling needs a real store (D1/Redis) — the `GachaStore` interface is the isolation point.
- **Persistence off by default:** set `GACHA_DATA_PATH=/app/data/gacha.json` (and a compose volume) to survive restarts; production should also set `GACHA_COOKIE_SECRET`.
- **`prefers-reduced-motion`:** respected visually only if you add a media query to disable `gacha-shake/quake` (one CSS block, listed here for honesty).
- **No audit log of individual pulls** — add an append-only `pulls` list if you ever need dispute resolution.

---

*Generated and verified by Buffy — 43/43 server tests green, server + web builds clean.*
