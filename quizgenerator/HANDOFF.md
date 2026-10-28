# Handoff — Quiz Generator (AI → Blooket)

**Date:** 2026-10-27  
**Project root:** `D:\DangKhoa\project\mini\Mini-Project\quizgenerator`  
**Source of truth:** `quizgenerator/PLAN.md` and `quizgenerator/README.md`  
**Status:** Phases 0–6 implemented. Shared/server/web builds pass; 12 unit tests pass. The compiled server now starts and answers `/healthz` (was crashing before — see below). Live end-to-end testing with real Gemini and Blooket credentials is still pending.

---

## What is already done

- **Phase 0:** Blooket CSV template analyzed; official 26-column format confirmed; fixtures and standalone Playwright spike created.
- **Phase 1:** Shared package (`packages/shared`) with types, Zod schemas, validation, RFC 4180 CSV builder/parser with UTF-8 BOM.
- **Phase 2:** React 19 + Vite + Tailwind editor, Zustand persistence, `@dnd-kit` reordering, cards/table views, mobile tabs, chat panel, publish modal, recent-sets modal.
- **Phase 3/4:** DOCX/PDF/XLSX/image extractors, chunker with answer-key separation, Gemini 2.5 Flash structured extraction and refine patch API.
- **Phase 5:** Playwright Blooket publisher, sequential in-memory job queue, Fastify routes for generate/refine/publish/status/admin/health.
- **Phase 6 prep:** Cloud Run-oriented Dockerfile, `quizgenerator/README.md`, root `README.md` entry.

### Most recent change: persistent Blooket login

Manual cookie copying has been replaced with a **persistent Playwright browser profile**:

- `server/src/blooket/session.ts` exports `USER_DATA_DIR` (`server/playwright-profile`) and `checkBlooketSession(page)`.
- `server/src/blooket/publisher.ts` uses `chromium.launchPersistentContext(USER_DATA_DIR, ...)`.
- If the session is invalid, the publisher opens the Blooket login page and waits up to **300 seconds** for manual login plus human verification. After that, the profile keeps the session for future runs.
- `spike/publish.ts` uses the same persistent-profile approach.
- Manual cookie-paste endpoint `/admin/cookies` was removed; `/admin/status` remains.

---

## Done in the 2026-10-27 follow-up session

1. **`quizgenerator/.gitignore` added** (node_modules, dist, `.env*`, playwright-profile, spike/screenshots). Verified with `git status -s` + `git check-ignore` that `.env`, `node_modules/`, `server/dist/`, `web/dist/` are excluded.
2. **Production build fixed.** `packages/shared` had no build step and its `main` pointed at `./src/index.ts`, so `node server/dist/index.js` (the Docker `CMD`) crashed with `ERR_MODULE_NOT_FOUND ... packages/shared/src/types.js`. Now `packages/shared/tsconfig.json` compiles to `dist/`, `package.json` points at `dist/index.js` + `dist/index.d.ts`, and `server`/`web` have `predev`/`prebuild` hooks that build shared automatically. Verified: built server starts with the production command and returns 200 `{"status":"ok"}` on `/healthz`; 12 unit tests still pass.
3. **Playwright version drift removed.** Root and server now pin `playwright@1.64.1`, matching the `mcr.microsoft.com/playwright:v1.64.1-noble` base image (the Dockerfile used `v1.50.1-noble`). The Dockerfile also builds `packages/shared` before the server and copies `web/package.json` so `npm install` sees a complete workspace graph. **The image itself has not been built locally (no Docker run available).**
4. **Document fixtures added** so the upload → extract path can finally be tested (previously only Blooket CSVs existed):
   - `fixtures/test-sample-answer-key.pdf` — 18 questions + a trailing `ĐÁP ÁN` key covering 1–16 (17–18 deliberately unanswered, to exercise the `aiGuessed` flag); has a real text layer so `pdf-parse` reads it.
   - `fixtures/test-sample-bold-answers.docx` — correct options marked by bold, plus one underline and one highlight mark, plus 3 unmarked questions. Extractors report 13 question starts, `**` and `<u>` and `==` markers all survive.
   - `fixtures/test-sample-photo.png` — worksheet photo with no answers marked, exercises the vision path.
   - Regenerate with `python fixtures/generate_docx.py` and `node fixtures/generate_pdf_png.mjs`.
6. **First successful end-to-end run (2026-10-27).** `fixtures/test-sample-answer-key.pdf` was uploaded through the UI with a real `GEMINI_API_KEY`: **18/18 questions extracted**, every auto-marked answer matched the answer key, the suggested title came from the `meta` event, `sourceRef` was filled with `Câu 1`…`Câu 18`, and 3 questions were flagged ⚠️ `aiGuessed` (the 5-option question trimmed to 4, plus the two questions the answer key deliberately omits). Editor showed `All (18) / AI-guessed (3) / Errors (0)`. `Download CSV` produced 2613 bytes with a real UTF-8 BOM (`EF BB BF`), the template's two banner rows, 26 columns, RFC 4180 quoting, `"1,2,3"` for the multi-answer question and `typing` in column J. One good run took **~18s**; the `@google/genai` SDK needed ~222s when it retried overloaded 503s.
7. **Model names were dead.** `gemini-2.5-flash` now returns 404 `no longer available to new users`. Defaults in `server/src/llm/gemini.ts` and `.env.example` are now `gemini-3.6-flash`, and the wrong version label was removed from the chat panel header. Note the flash family is intermittently overloaded: 2 of 5 measured calls failed with 503 (fast) and one failed only after the SDK's ~222s retry window.
8. **Known bug (FIXED 2026-10-28): chunk failures were silent.** `routes/generate.ts` used to catch per-chunk errors and return an empty question list, so a 503 became HTTP 200 plus `done{stats:{total:0}}` and the UI reported “Extracted 0 questions successfully!”. Now failures are tracked in `failedChunks`: if every chunk failed the route emits an SSE `error` event (the UI clears the spinner and shows the failure), and a partial failure is reported in `done{stats.failedChunks}` plus a `warning` message. `ChatPanel.tsx` handles the `error` event. Also capped the SDK's long retry (default 5 attempts / up to 60s backoff measured ~222s): `getGeminiClient()` now sets `httpOptions.timeout` (60s, env `GEMINI_TIMEOUT_MS`) and `retryOptions` (3 attempts, env `GEMINI_RETRY_ATTEMPTS`). **Verified live:** a full 18-question generate run emitted `done{stats:{total:18,chunks:1,failedChunks:0}}` through the Vite proxy.
9. **Known bug (FIXED 2026-10-28): typing questions lost accepted variants.** `buildBlooketCsv` took column H from `q.correct`, so a model answer of `correct:[0]` with `answers:["học","Học"]` only accepted variant 1. The typing branch now always writes **all** answers (`1,2`), per PLAN. Regression test added in `csv.test.ts` (“writes ALL typing answer variants as accepted…”); verified live against the exact payload Gemini returned (`correct:[]` → `"1,2"`).
10. **Blooket automation timeouts were too short (fixed).** A first `npm run spike` run failed with `Timeout 30000ms exceeded` while the user was still logging in, and the human-verification step rejected the browser as a bot. Changes in `spike/publish.ts`, `server/src/blooket/publisher.ts` and `server/src/blooket/session.ts`: every navigation now defaults to 90s (`page.setDefaultNavigationTimeout`), the manual login window went 120s → 300s, the create-set page switched from `waitUntil: 'networkidle'` (never settles there — this was the actual 30s timeout) to `domcontentloaded` + `waitForSelector(titleInput)`, and the set-URL wait went 20/25s → 90s. To reduce the chance of failing verification: the hardcoded `Chrome/126` UA was removed (Playwright's own version string is consistent), `--disable-blink-features=AutomationControlled` was added and `navigator.webdriver` is shadowed. Human verification is **still solved manually by the user** — nothing is bypassed, per PLAN. New opt-in env `BLOOKET_BROWSER_CHANNEL=chrome` uses the installed Chrome (unset keeps Playwright's Chromium, and the Docker image has no Chrome binary). Verified: spike typecheck + server build + 12 tests pass. **Not verified: the real login/verification flow still needs a manual run.**
11. **The `/create` selectors were wrong, and one was structurally broken (fixed after the first real run).** The screenshot from that run shows the real page: method buttons `Manual (Default)` / `Quizlet Import` / **`CSV Upload`**, Title input with placeholder **`Add a descriptive title`**, Description textarea `Tell users about your question set`, a `Create Set` button that is disabled until Title is filled, and Privacy defaulting to Public.
    - **Playwright rule worth remembering:** a comma-separated selector list may only contain **CSS** selectors. If any part is prefixed with an engine (`text="..."`), the whole list silently matches nothing when that part is first, or throws a CSS parse error when it is not. The old `csvImportButton` began with `text="CSV Import"`, so **the CSV method had never been selected in any previous run**. Both selector files now use CSS + `:has-text()`/`:text()` only, and both were verified against a DOM mimicking the real page (all selectors match, `page.fill` on the title works, the CSV button reports visible).
    - Failure output now prints the page URL next to the screenshot.
    - The CSV method chooser on `/create` turned out to be a dead end — see item 12.
12. **The CSV import happens on the EDIT page, not on `/create` (second real run).** That run created a set (URL `dashboard.blooket.com/edit?id=6ae0d8747111a179758813f9`, title `Auto Spike Set …`) but the cover badge read **`0 Questions`**: the flow clicked `Create Set`, Blooket created an empty set, and there is no reachable upload step on `/create`. The Edit page holds `Save Set` (top left), the cover badge `N Questions`, and **`IMPORT FROM → Question Bank / Spreadsheet / Quizlet`** — the CSV import is the **`Spreadsheet`** button there.
    - Both files were rewritten to: fill Title (+Description) → `Create Set` → wait for `/edit?id=…` → click `IMPORT FROM → Spreadsheet` (skipped when a CSV/visible file input already exists) → upload → **poll the `N Questions` badge until it equals the expected count** (4 for `fixtures/test-sample-basic.csv`, `questions.length` on the server) and fail loudly otherwise → click `Save Set` → final link is a real `/set/` redirect or derived as `https://dashboard.blooket.com/set/<id>` from `/edit?id=<id>` → **public check**: reopen that link in a fresh logged-out persistent profile (headless) and confirm it does not bounce to `id.blooket.com/login`. A failed check still returns the link but changes the `done` message.
    - New selectors: `edit.importSpreadsheetButton` (`button:has-text("Spreadsheet")`) and `edit.questionCountBadge` (`text=/\d+ Questions/`); the old class-guess `questionCountBadge` was replaced.
    - Verified: every Edit-page selector against a DOM mimicking the screenshot (including a negative test for the badge), spike typecheck, server build, 12 tests.
13. **Full end-to-end publish verified (third real run, 2026-10-27).** `npm run spike` completed cleanly: existing session reused (no login needed) → created set → Edit-page Spreadsheet import → **`Verified 4 questions imported.`** → Save Set → **public check passed** (fresh logged-out headless profile opened the set without bouncing to login). Result: `https://dashboard.blooket.com/set/6ae0e263e60771824052c374`, 4 questions. Two final fixes were needed:
    - **Save does not redirect to `/set/`** — in a real run it landed on `/my-sets`, so `deriveSetUrl(page.url())` *after* save lost the id and returned `/my-sets` (the anon check then "failed" against a non-set URL). Both files now capture the `/edit?id=…` URL right after `Create Set` and derive the public link from that (`page.url()` still wins if a real `/set/` redirect happens).
    - **The anon check browser sometimes fails to launch on Windows** (headless shell exit `0xC0000142` / "Target page, context or browser has been closed" — transient, first seen in a real run). `verifyPublic` now retries up to 3 times with a fresh profile dir and 2s backoff before reporting false.
    - Verified: spike typecheck + server build pass, then two live runs — first confirmed the `/my-sets` fix produced the right `/set/` link, the retry fix then produced a full **SUCCESS** with the public check green.
5. **`.env` loading fixed.** `server/src/index.ts` only looked for `.env` in `process.cwd()`, so the documented dev flow (`cd server && npm run dev`, cwd = `server/`) resolved to a non-existent `server/.env` and never saw `quizgenerator/.env` — every `/api/generate` call would have failed with “GEMINI_API_KEY is not set”. It now checks cwd, the parent directory and the module directory, and logs `Loaded environment from <path>` on startup. Verified from both `quizgenerator/` and `quizgenerator/server/`.

---

## Done in the 2026-10-28 session

1. **Blooket `Create Set` click timeout fixed.** The selector resolved to 2 elements and Playwright clicked a **disabled** first match, retrying for the full 90s ("element is not enabled"). `selectors.ts` gained `createButtonEnabled` (only enabled buttons) and `publisher.ts` now fills the **visible** title/description, clicks only an enabled+visible button (30s), and retries once with a re-fill.
2. **`PublishModal` reported false failures.** A successful publish showed "Connection lost with publish worker." because `onerror` read a stale `status` closure (`status !== 'done'` was always true) and closed the EventSource on the first error — but the browser fires `error` on every normal server close after `done`. Fixed with a closure `terminal` flag, EventSource auto-reconnect (server replays job state), a 3-reconnect budget and a final one-shot status resync. Added the missing `creating-set` status display. **Verified live: full UI publish succeeded** → `https://dashboard.blooket.com/set/6ae1756b50153717dc8e7f8e` (18 questions), history entry written, set opens logged-out.
3. **Dev-server port trap:** the API must own `3001` and Vite `3000`. If Vite starts while 3000 is taken it silently grabs 3001 (IPv6) and hijacks `/api` — kill the stray Vite and restart it on 3000. `curl http://127.0.0.1:3001/healthz` must return JSON.
4. README now documents the persistent-profile login flow (no cookie pasting) and `GEMINI_MODEL` / `BLOOKET_BROWSER_CHANNEL`.
5. Verified end-to-end in the browser: SSE generate (18/18 questions via proxy), refine patches, Download CSV, New Session button, publish + public set link. 13 unit tests pass; `npm run build --workspaces` clean.

---

## Immediate next steps

1. **Commit carefully.** `.gitignore` now exists, but nothing is committed yet and the repo root is the parent `Mini-Project` project, so avoid a blanket `git add -A` from the root and stage `quizgenerator/` deliberately.

2. **Configure Gemini key.**
   Put a real `GEMINI_API_KEY` in `quizgenerator/.env` (created from `.env.example`). Do **not** commit `.env`.

3. **Run the app end-to-end.**
   ```bash
   # terminal 1
   cd quizgenerator/server
   npm run dev

   # terminal 2
   cd quizgenerator/web
   npm run dev
   ```
   Open `http://localhost:3000`, upload `fixtures/test-sample-answer-key.pdf` / `test-sample-bold-answers.docx` / `test-sample-photo.png`, verify SSE extraction, edit questions, refine via chat, and download the CSV. The first `npm run dev` in `server/` or `web/` builds `packages/shared` automatically via its `predev` hook.

4. **Test first live Blooket publish.**
   Use the UI or:
   ```bash
   cd quizgenerator
   npm run spike
   ```
   On first run, the browser window should open; log in manually and pass human verification within **300 seconds**. Confirm the profile is saved under `quizgenerator/server/playwright-profile/` and that subsequent runs skip login.
   If the profile ends up in a broken state, delete `quizgenerator/server/playwright-profile/` and start over. If verification keeps failing, retry with `BLOOKET_BROWSER_CHANNEL=chrome` to use the installed Google Chrome instead of Playwright's Chromium (local only — the Docker image has no Chrome binary).
   Verify the returned `/set/...` URL is publicly accessible in an incognito window.

5. **Re-check Blooket selectors.**
   `server/src/blooket/selectors.ts` and `spike/selectors.ts` were written from an earlier UI inspection. Blooket may change labels/classes; update selectors if create/import/save steps fail. Use screenshots in `spike/screenshots/` for debugging.

6. **Update outdated README text.**
   `quizgenerator/README.md` still mentions copying cookies and `/admin`. It should describe the persistent-profile flow instead.

7. **Remaining Docker/Cloud Run work.**
   - Playwright versions are now pinned consistently and the image tag matches; still verify by actually building the image (`docker build -f server/Dockerfile .`).
   - Cloud Run storage is ephemeral, so `server/playwright-profile` will not survive instance restarts, and a headless container has nobody to complete the first manual login. Decide between a persistent volume with an injected session, keeping auto-publish local-only (Download CSV in production), or a dedicated publishing host, before doing Phase 6.

---

## Known risks / notes

- No real Gemini or Blooket credentials were used yet; extraction quality and live publishing are unverified.
- Persistent-profile login requires a visible browser. For a headless production setup, the first login must happen locally or via a headed container/VNC; current env flag is `PLAYWRIGHT_HEADLESS=true`.
- `quizgenerator/.gitignore` now covers this project's secrets and build output, but the outer repo root is the parent `Mini-Project` project, so the whole `quizgenerator/` tree still shows as untracked until it is staged deliberately.
- `.env` currently contains empty placeholders only; never commit it after adding secrets.
- Unit tests: `npm test` from `quizgenerator/` passes (9 shared + 3 server). Builds: `npm run build --workspaces` passes for shared, server and web. The compiled server `node server/dist/index.js` has been started and responds 200 on `/healthz`.
- `packages/shared` must be compiled before the server runs standalone; the `predev`/`prebuild` hooks in `server/` and `web/` handle this, as does `npm run build --workspaces`.

---

## Suggested skills for the next agent

- **`impeccable`** — if the next session includes UI/UX review or polish of the editor/chat/publish flows.
- **`ui-ux-pro-max`** — for concrete frontend fixes around layout, accessibility, or responsive behavior.
- **`report`** — only if an OpenCode issue/bug needs to be filed.

No specialized skill is available for the Blooket Playwright integration; debug that directly with browser traces/screenshots.

---

## Key references

- `quizgenerator/PLAN.md` — full architecture and milestone plan.
- `quizgenerator/README.md` — setup and feature overview (partially outdated re: cookies).
- `quizgenerator/packages/shared/src/csv.ts` — Blooket CSV generation/parsing.
- `quizgenerator/server/src/blooket/publisher.ts` — persistent Playwright publish flow.
- `quizgenerator/server/src/blooket/session.ts` — `USER_DATA_DIR` + session check.
- `quizgenerator/server/src/queue/jobQueue.ts` — sequential publish queue.
- `quizgenerator/server/src/llm/gemini.ts` — Gemini extraction/refine.
- `quizgenerator/spike/publish.ts` — standalone persistent-profile spike.
- `quizgenerator/.env.example` — environment template.
