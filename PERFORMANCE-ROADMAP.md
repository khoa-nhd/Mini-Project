# Performance & Infrastructure Optimization Roadmap

**Prepared for:** Mini-Project monorepo (`quizgenerator`, `quicknotes`, `interactivequiz`)
**Date:** November 2026
**Basis:** deep dive grounded in the *actual* code and configs in this workspace, not a generic template.

---

## 0. Stack reality check (read this first)

Your request referenced Nginx/Apache, SQL `EXPLAIN`, PgBouncer, Varnish, and OPcache. This workspace runs a **different stack**, and several of those items simply do not exist here — applying them would be busywork. The honest mapping:

| Requested item | What actually exists here | Verdict |
|---|---|---|
| Nginx/Apache tuning | **Caddy 2.10** reverse proxy (`deploy/Caddyfile`), automatic HTTPS | Tune Caddy instead — it already serves HTTP/3 + zstd/gzip |
| SQL DB, `EXPLAIN`, PgBouncer, replicas | **No SQL DB.** QuizGen stores in `localStorage` (+ in-memory queue); QuickNotes uses **Firestore** + IndexedDB | Use Firestore indexing/query patterns. PgBouncer/`EXPLAIN` = N/A |
| Varnish / FastCGI page cache | Static SPA served from Firebase Hosting CDN (QuickNotes) or `@fastify/static` + Caddy (QuizGen); no SSR | Not applicable; edge caching is the useful lever |
| OPcache / bytecode caching | Node.js (V8 JIT) + Vite production build | N/A — the analogues are bundle weight, V8 flags, and warm processes |
| Redis/Memcached | Not present, single-instance server | Optional: only if you ever scale past one instance |

**Infrastructure as found:**

```
Browser ──► Caddy 2.10 (TLS, HTTP/3, zstd/gzip, SSE unbuffered)
              └─► Fastify :8080 in Docker
                    ├─ @fastify/static → web/dist (immutable /assets/*, no-cache HTML)
                    ├─ SSE endpoints (/api/generate, publish status)
                    ├─ Gemini API calls (new client per request today)
                    └─ in-memory FIFO queue → headless Playwright/Chromium on a VPS
QuickNotes      ── ► Browser JS → Firebase Hosting CDN + direct Firestore/Auth
interactivequiz ── ► pure static HTML/JSON, no server at all
```

**Current metrics:** none exist in the repo, so Step 1 is the prerequisite — nothing below can be honestly verified without a baseline.

Prioritized backlog (impact × effort, informed by code review):

```
HIGH impact, low effort:
  P1  Gemini client singleton + session reuse              (server hot path)
  P2  Extraction result caching by content hash            (largest single latency win)
  P3  Vite code splitting for quizgenerator/web            (no chunk config today)
  P4  Cloudflare edge cache for immutable assets           (new-user TTFB)
  P5  Firestore write batching + listener audit            (QuickNotes sync cost)
MEDIUM:
  P6  Caddy upstream keep-alive & header hardening
  P7  Resource hints for the Turnstile origin (QuizGen)
  P8  Remove render-blocking Google Fonts (QuickNotes)
LOW (do later):
  P9  Redis/object-cache tier                              (only at a scaling trigger)
  P10 Warm Playwright browser, InteractiveQuiz static pass
```

---

## Step 1 — Instrumentation & baseline (before touching anything)

No measurements, no claims. Every phase ends in a concrete verification method; establish the baseline now.

### 1.1 TTFB / latency from the terminal

```bash
# Per-request breakdown (TCP, TLS, TTFB, total), 10 samples:
for i in $(seq 1 10); do
  curl -so /dev/null -w "%{time_connect}s tcp | %{time_appconnect}s tls | %{time_starttransfer}s TTFB | %{time_total}s total\n" https://YOUR-DOMAIN/
done

# Over HTTP/3 (Caddy already serves it; needs an HTTP/3-capable curl build):
curl --http3-only -so /dev/null -w "%{time_starttransfer}\n" https://YOUR-DOMAIN/
```

**Targets after P4:** TTFB on cached static < 80 ms; `/healthz` < 50 ms from-region.

### 1.2 Frontend baseline

```bash
# Lighthouse CI run (repeat after each phase; scores become your ongoing artifact)
npx --yes @lhci/cli autorun --collect.url=https://YOUR-DOMAIN
```

In-browser: DevTools → Performance and Network. Capture LCP/FCP/TTFB and the JS bundle weight — today `quizgenerator/web/vite.config.ts` has no `build.rollupOptions`, so Vite emits effectively monolithic per-entry bundles.

### 1.3 Server-side budget

```bash
docker stats --no-stream               # CPU/RAM idle vs. during a generate/publish job
docker compose logs -f app 2>&1 | pino-pretty | grep -E 'extract|publish|generate'
```

Fastify already ships a pino logger. Wrap the expensive stage with `process.hrtime.bigint()` inside `generateRoute` (around `extractFromChunk`) and keep the numbers in the baseline table.

### 1.4 Firestore baseline (QuickNotes)

- Firebase console → **Firestore → query latency statistics** (P50/P99 metadata free of charge).
- DevTools → Performance for 2 minutes while signed in and editing a note: this surfaces the write-storm cost.
- Network panel filtered to `firestore.googleapis.com`: count **writes per note-edit pause**.

### 1.5 Fill this table first

| Metric | QuizGen | QuickNotes | How measured |
|---|---|---|---|
| TTFB cold / warm | ___ / ___ ms | ___ / ___ ms | curl loop ×10 |
| JS transfer weight | ___ KB | ___ KB | Lighthouse / `du -sh dist/assets` |
| LCP / FCP | ___ / ___ | ___ / ___ | Lighthouse |
| Firestore writes per edit | n/a | ___ | network panel |
| `/api/generate` first byte | ___ ms | n/a | server log hrtime |
| Publish job p50 / p95 | ___ / ___ | n/a | `jobLog` timestamps |

---

## Phase 1 — Server response time & TTFB (Fastify + Caddy)

### 1.1 [P1] Reuse the Gemini HTTP client — module-scope singleton

**Evidence:** `server/src/llm/gemini.ts` — `getGeminiClient()` is called **inside every `extractFromChunk()` / `refineQuestionsWithPrompt()` call**. Each request pays fresh client construction and connection setup; a single long-lived client reuses pooled TLS sessions and behaves more predictably under the sequential queue.

```ts
// server/src/llm/gemini.ts
let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (_client) return _client; // reuse pooled TLS sessions
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables.');
  _client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: Number(process.env.GEMINI_TIMEOUT_MS || 60000),
      retryOptions: { attempts: 3, initialDelay: 2, maxDelay: 10, expBase: 2, jitter: 0.5 },
    },
  });
  return _client;
}
```

**Benchmark:** first byte of `/api/generate` measured with a cold `docker compose restart app` before / after. Also log upstream call duration around `generateContent`.

### 1.2 [P2] Cache extraction results by content hash

`/api/generate` = multipart parse → PDF/DOCX/XLSX parse → chunk → **Gemini (5–90 s, billed)** → JSON. Students re-upload the same document repeatedly; identical chunk + model + prompt must not hit Gemini again.

```ts
// server/src/llm/extractCache.ts (new, ~30 lines, zero deps)
import crypto from 'node:crypto';

interface Entry { result: unknown; ts: number }
const store = new Map<string, Entry>();   // process-local; container has file volume if you persist later
const TTL = 1000 * 60 * 60 * 3;           // 3 h
const MAX = 200;

export function makeChunkKey(chunkText: string, mimeType: string, model: string, userPrompt?: string) {
  return crypto.createHash('sha256')
    .update([chunkText, mimeType, model, userPrompt ?? ''].join('\u0000'))
    .digest('hex');
}

export async function cachedExtract<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.result as T;
  const result = await loader();
  if (store.size >= MAX) store.delete(store.keys().next().value!); // FIFO
  store.set(key, { result, ts: Date.now() });
  return result;
}
```

Wire into the generate route per chunk: `cachedExtract(makeChunkKey(chunk, mime, model, prompt), () => extractFromChunk(...))`. Refine is stateful — leave it uncached.

**Benchmark:** upload the same file 3×. Expected: pass 2 and 3 reach first SSE byte in ≈ parse-only time (< 2 s) instead of the Gemini round-trip. Log hits: `server.log.info({ cache: 'extract' })`.

### 1.3 [P6] Caddy upstream keep-alive + correct header rules

`deploy/Caddyfile` is minimal today. Tightened (note: Caddy needs a named matcher for path-scoped headers — `assets/*` globbing inside a plain `header` block is not valid):

```caddyfile
{$DOMAIN} {
    encode zstd gzip

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }

    reverse_proxy app:8080 {
        # Stream SSE (generate progress, publish status) without buffering.
        flush_interval -1
        # Warm pool + bounded idle sockets between /admin status polls.
        keepalive 8 2m
        health_check {
            interval 30s
            timeout 2s
        }
    }
}
```

**Benchmark:** `curl --http3-only -I https://YOUR-DOMAIN/assets/index-HASH.js` twice (verify header present); time a `/healthz` before/after enabling the health check; confirm the SSE stream (`/api/generate`) still streams without buffering after the config change — that is the one regression risk here.

### 1.4 HTTP/2 & HTTP/3 — already correct; verify, don't rebuild

Caddy 2.10 speaks HTTP/3 automatically when UDP 443 is open, and `docker-compose.yml` already maps `443:443/udp`. Do **not** migrate to Nginx for this. Verify:

```bash
curl -sI https://YOUR-DOMAIN/ | grep -i 'alt-svc'     # advertises h3
curl --http3-only -so /dev/null -w '%{http_version}\n' https://YOUR-DOMAIN/
```

### 1.5 OPcache analogue — Node/V8 specifics, not PHP

No PHP ⇒ no OPcache. The productive equivalents:

- Ship compiled JS in prod (already done: `server/dist`, `web/dist`; Dockerfile builds before start). Never run `tsx watch` in the image.
- The real process-cost monster here is **Chromium/Playwright**. With `shm_size: 1gb` and headful mode, a publish job that cold-spawns Chromium costs many extra seconds; the durable-profile dir already avoids re-login. Measure publish p95 (baseline table) — if Chromium spawn dominates, pre-warm the browser at server boot (only if the queue tolerates a pre-spawned instance).

### 1.6 Varnish / FastCGI / SSR page cache — verdict: do not add

Three reasons: (1) there is no SSR — the HTML shell must revalidate by design (`no-cache` already set in `webApp.ts`); (2) the API is SSE + multipart uploads, which page caches are hostile to; (3) a second cache layer in front of Caddy duplicates TLS/HTTP termination. If you later adopt SSR, revisit with an edge-CDN cache rule instead.

---

## Phase 2 — Database performance & query tuning

### 2.1 The "database" here is Firestore + IndexedDB + persisted localStorage

There is no `EXPLAIN`; Firestore's equivalents are the **console query/index validator** ("Add index" toast when a query can't use one), **Index Manager**, and the documented **-latency metric**. Findings + actions:

**(a) Index status — good.** `quicknotes/firestore.indexes.json` already declares `(userId, folderId, order)`, `(userId, pinned DESC, order)`, `(userId, updatedAt DESC)`, and folders `(userId, order)`. Verify deployments match queries by attempting each app query with the emulator (`firebase emulators:start`) — the console error names any missing index precisely, which is your `EXPLAIN`-equivalent output.

**(b) N+1-equivalent — the Firestore write/read pattern.** The audit of `quicknotes/src/services/firebaseSync.ts` pattern: look for or prevent these:

```ts
// ❌ N+1: one round-trip + one latency per note
for (const n of changedNotes) await setDoc(doc(db, 'notes', n.id), n, { merge: true });

// ✅ batched: one write latency for the whole change set
const batch = writeBatch(db);
changedNotes.forEach((n) => batch.set(doc(db, 'notes', n.id), n, { merge: true }));
await batch.commit(); // batch limit: 500 ops
```

Same for reads: prefer a single `onSnapshot(query(collection(db,'notes'), where('userId','==',uid)))` composite listener over N per-document `getDoc` calls; if you fan out, `getAll(...docs)` batches them in one round trip.

**(c) Unbounded reads.** Auto-save bumps `updatedAt` per typing pause; a query that fetches full note bodies of an entire collection grows linearly with user history. Paginate:

```ts
const first = query(colRef, orderBy('updatedAt', 'desc'), limit(pageSize));
const next  = query(colRef, orderBy('updatedAt', 'desc'), limit(pageSize), startAfter(lastDoc));
```

**(d) Listener hygiene.** Every `onSnapshot` bills until `unsubscribe()`. Screen swaps that forget to detach accumulate listeners — this presents as "app gets slower the longer you use it." Audit `firebaseSync.ts` for paired subscribe/unsubscribe in cleanup paths.

**(e) QuizGenerator's localStorage "DB".** The Zustand store persists to `localStorage`; with large question sets every mutation pays a synchronous full JSON serialize. Guard with `partialize` (persist only what must survive reloads) and debounce the persist write; never persist derived/transient state.

### 2.2 PgBouncer / ProxySQL / read replicas — N/A

No SQL server exists to pool or replicate. Revisit only if a feature forces Postgres; the ready-made template is in the Appendix.

### 2.3 The throughput ceiling that *is* real: the sequential Playwright queue

`server/src/queue/jobQueue.ts` runs 1 job at a time and each job drives Chromium. Publish p95 is dominated by browser spawn + Blooket page latency. The cheapest win is a warm browser process (Phase 1 §1.5), not a queue rewrite; the queue's serial design is actually a feature against anti-bot detection.

**Verification for every Firestore change:** identical scripted note-edit session in DevTools, writes-per-edit count + P50 before/after; emulator query logs for index usage.

---

## Phase 3 — Multi-layer caching

### 3.1 Layer 1 — browser HTTP caching: mostly already right; fix the gaps

**Already correct:** QuickNotes `firebase.json` sets `/assets/** → max-age=31536000, immutable`, `sw.js → no-cache`, HTML shell `no-cache`. QuizGen `webApp.ts` mirrors it via `@fastify/static` `setHeaders` (assets immutable, everything else `no-cache`, with `cacheControl: false` so the plugin's `max-age=0` default doesn't override). This is textbook hash Immutable caching — keep it.

**Gaps:**

1. QuizGen has **no edge cache**: assets are browser-cached, but every *new* user downloads the full app from a single-origin VPS with regional TTFB. → P4.
2. QuickNotes loads `fonts.googleapis.com` CSS **render-blocking** before first paint. → P8.

### 3.2 [P4] Cloudflare edge cache in front of the QuizGen VPS

The one large TTFB move left for new-visitor latency, since Vite emits content-hashed asset URLs that are perfectly cacheable:

1. Proxy the domain's DNS through Cloudflare (orange cloud); origin remains the VPS — Caddy serves **Full (strict)** with an Origin Certificate or Let's Encrypt against proxied DNS.
2. Cloudflare → Caching → Cache Rules:

   ```
   If hostname eq quiz.YOUR-DOMAIN AND URI Path starts with /assets/
     → Eligible for cache
     → Edge TTL: respect origin Cache-Control (immutable ⇒ 1 year)
   If URI Path does NOT start with /api or /assets
     → Bypass cache (HTML shell + SSE must always revalidate)
   ```
3. Turnstile (already used in this app) stays untouched — same zone.

**Do not** front QuickNotes with Cloudflare: Firebase Hosting **is** its global CDN already.

**Verify:** `curl -sD - -o /dev/null https://YOUR-DOMAIN/assets/index-HASH.js | grep -i cf-cache-status` — expect `MISS` then `HIT` on the second call. If `cf-cache-status` for `/assets/*` shows `DYNAMIC`, the battery is the rule regex, not the origin.

### 3.3 [P9] Redis/Memcached object tier — defensible only at a future trigger

Single process, single container, no shared session state, no horizontal replicas ⇒ zero current benefit, one more failure point. Trait triggers: (a) >1 app container sharing the queue, (b) cross-deploy extract-cache persistence. A ready cache-aside sketch is in Appendix B; **do not apply today.**

### 3.4 Layer 2 — service-worker caching (QuickNotes): one real gap

QuickNotes already precaches every app asset and uses `CacheFirst` runtime caching for Google Fonts with yearly expiration. Two follow-ups:

1. If you execute **P8** (self-host fonts), the precache covers them automatically since `globPatterns` includes `woff2` — the network fonts config can then be deleted.
2. `maximumFileSizeToCacheInBytes: 5 MB` was raised *because* the Firebase bundle is large. Don't raise the ceiling again; if a single compiled chunk exceeds ~4 MB, that's Phase 4's `manualChunks` problem. Check: `cd quicknotes && npm run build && ls -lS dist/assets | head`.

### 3.5 Layer 3 — ETag revalidation

`@fastify/static` supplies ETags automatically; confirm the reload path returns 304s, which is what makes the HTML shell cheap:

```bash
curl -sD - -o /dev/null https://YOUR-DOMAIN/ | grep -iE 'etag|cache-control'
curl -sD - -o /dev/null -H 'If-None-Match: <etag-from-above>' https://YOUR-DOMAIN/ | head -1   # expect 304
```

### 3.6 Layer 4 — OPcache equivalent

See §1.5. AOT-like analogy: the Vite production transform + pino structured logs; nothing further applicable to Node in this codebase.

---

## Phase 4 — Frontend & static asset optimization

### 4.1 [P3] Code splitting — QuizGenerator (biggest frontend win)

`quizgenerator/web/vite.config.ts` has no build config ⇒ React + dnd-kit + everything else merges into a few monolithic chunks. Identify eager imports you never need at first paint — the Shiny candidates in this app add real risk:

- `@dnd-kit/*` — needed only after questions exist;
- export modals / CSV paths (`file-saver`, `jszip`, and any web-side XLSX);
- the ChatPanel (refine flow, live only after generation).

```tsx
// components: dynamic rather than eager where the route lets it be
const ChatPanel = lazy(() => import('./components/ChatPanel'));
const ExportModal = lazy(() => import('./components/ExportModal'));
// wrap in <Suspense fallback={<SkeletonRow/>}>
```

```ts
// quizgenerator/web/vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules/@dnd-kit')) return 'dnd';
        if (id.includes('node_modules/react')) return 'react-vendor';
      },
    },
  },
},
```

**Benchmark:** `npx vite build && du -sh web/dist/assets/* | sort -h`; Lighthouse "Reduce unused JavaScript" before/after. Goal: initial JS ≤ ~220 KB gz (record the before-number first — see baseline table).

### 4.2 QuickNotes — Firebase bundle weight

`vite.config.ts` raised the Workbox ceiling explicitly for the Firebase bundle. If the data shows the main chunk overshoots, lazy-initialize Firebase after first paint (the app is already written so offline/IndexedDB works without a signed-in user):

```ts
// quicknotes/src/services/firebaseSync.ts
let fbPromise: Promise<typeof import('firebase/app')> | null = null;
export function ensureFirebase() {
  return (fbPromise ??= import('firebase/app'));
  // then also dynamic-import firebase/auth + firebase/firestore inside the sync path
}
```

Vite splits Firebase out of the entry chunk; the app shell paints before a single Firebase byte arrives. Verify with the 4 MB precache ceiling intact and `du -sh dist/assets` before/after.

### 4.3 [P7] Resource hints

QuickNotes already preconnects to both font origins (good). QuizGen's `web/index.html` has **zero hints** and ships the Turnstile script without warm-up:

```html
<!-- web/index.html, inside <head> -->
<link rel="preconnect" href="https://challenges.cloudflare.com" crossorigin />
<link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
```

The existing `async defer` Turnstile `<script>` is already non-blocking — keep it exactly as is. **Don't over-preload** (each preload is a bandwith tax); validate with DevTools → Network → Priority column.

### 4.4 [P8] QuickNotes render-blocking Google Fonts

`quicknotes/index.html` pulls the Plus Jakarta Sans stylesheet render-blocking from Google's CDN (~100–600 ms before first paint on slower networks). Two correct fixes, in order of preference:

1. **Self-host 2 weights** (400/600), preload the used one, drop the external `<link>`:

   ```html
   <link rel="preload" as="font" type="font/woff2" href="/fonts/jakarta-600.woff2" crossorigin />
   <!-- @font-face in your CSS; files live under public/fonts/ and precache automatically -->
   ```

2. Or remove external fonts for a system stack in a notes-first PWA (fastest, cheapest).

Afterward delete the now-dead Workbox `google-fonts-cache`/`gstatic-fonts-cache` runtime rules. **Benchmark:** Lighthouse FCP before/after on a throttled "Slow 4G" profile.

### 4.5 `loading="lazy"`, media, AVIF/WebP

Inventory reality: this workspace has practically no `<img>` payload surface — SVG icons and small PWA PNG icons. Apply the pattern when imagery enters InteractiveQuiz or QuizGen previews:

```html
<video poster="x.jpg" preload="none" ...></video>
<img src="p.avif" loading="lazy" decoding="async" width="640" height="360" alt="">
```

AVIF/WebP adoption is a real item **only when raster images appear**; today the correct optimization is *not adding raster assets*. Keep the checklist ninja but don't tool up.

### 4.6 `async` / `defer` — already conformant

Vite emits `type="module"` scripts (deferring by spec), and Turnstile already declares `async defer`. Nothing to change here; verify no render-blocking script slips in later via Lighthouse's "Eliminate render-blocking resources" audit.

---

## Execution order & acceptance criteria

| # | Action | Files / surface | Verification |
|---|---|---|---|
| S1 | Baseline numbers (fill §1.5) | — | curl ×10, Lighthouse, docker stats, Firestore console |
| P1 | Gemini client singleton | `server/src/llm/gemini.ts` | cold-restart first-byte ↓ |
| P2 | Extract cache by content hash | `server/src/llm/extractCache.ts` + generate route | re-upload < parse-only latency |
| P6 | Caddy keep-alive + matcher header rules | `deploy/Caddyfile` | asset headers + SSE still streams |
| P3 | Code split QuizGen web | `web/vite.config.ts`, components | initial JS KB, unused-JS audit |
| P4 | Cloudflare edge cache | DNS + zone Cache Rules | `cf-cache-status: MISS→HIT` |
| P7 | Hints for Turnstile origin | `web/index.html` | waterfall overlap |
| P5 | Firestore batching + listener audit | `quicknotes/src/services/firebaseSync.ts` | writes/edit ↓, no leaked listeners |
| P8 | Self-host fonts / drop CDN font CSS | `quicknotes/index.html`, `public/fonts/` | FCP on Slow 4G |
| P9 | (defer) Redis tier | — | only at scaling triggers |
| P10 | Warm Playwright browser; InteractiveQuiz pass | `server/queue`, `interactivequiz/` | publish-from-restart timing |

---

## Appendix — templates kept for later triggers

### A. If Postgres is ever introduced

```sql
-- measure, don't guess
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20;

CREATE INDEX CONCURRENTLY idx_notes_user_updated ON notes (user_id, updated_at DESC);
-- then: pg_stat_statements for the top offenders; PgBouncer in transaction mode
-- (`default_pool_size = 2 * vCPU`) between app and DB; read endpoint via a replica.
```

### B. If Redis becomes real (multi-worker / persisted cache)

```ts
// cache-aside sketch
async function getWithCache<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const fresh = await loader();
  await redis.set(key, JSON.stringify(fresh), 'EX', ttl);
  return fresh;
}
```

### C. If server rendering ever replaces the static shell

Then the Caddyfile HTML route gets an edge-cache rule instead of `bypass` (stale-while-revalidate on the shell), and SSR caching routes are decided at that point — not before.
