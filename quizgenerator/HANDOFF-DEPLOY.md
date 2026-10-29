# Handoff: quizgenerator — deploy "chạy hoàn toàn online" (Phase 6)

Written: 2026-10-29. For a fresh agent. User communicates in Vietnamese; replies have been in Vietnamese.

## Where the project is

- Repo root: `D:\DangKhoa\project\mini\Mini-Project` (git, remote `github.com/khoa-nhd/Mini-Project`, branch `main`).
- Project: `quizgenerator/` — upload tài liệu → Gemini trích câu hỏi → editor React → publish set public lên Blooket. npm workspaces: `packages/shared`, `server/` (Fastify + Playwright), `web/` (Vite React).
- Authoritative docs (read these instead of duplicating): `quizgenerator/PLAN.md` (spec + lộ trình Phase 0–6), `quizgenerator/HANDOFF.md` (trạng thái + bug đã fix + selector notes). HANDOFF có vài mục đã cũ ("chưa commit", "chưa có credential") — trạng thái thật xem phần dưới.

## Verified status (chạy thật, không phải suy đoán)

- **Phase 0–5 complete and verified end-to-end**: `npm run spike` tạo được set public (https://dashboard.blooket.com/set/6ae0e263e60771824052c374, 4 câu); publish từ UI thành công 18 câu (https://dashboard.blooket.com/set/6ae1756b50153717dc8e7f8e); generate 18/18 từ PDF fixture; CSV đúng format BOM; refine patch OK.
- 13 unit tests pass; `npm run build --workspaces` clean.
- Đã commit + push (session này): `c208a8c` (spike enabled-Create-Set fix), `c92ed61` (BLOOKET_TMP_DIR), `7d391cc` (commit đầu tiên của toàn bộ 63 file quizgenerator). Working tree sạch, khớp `origin/main`.
- Dev servers KHÔNG còn chạy (Freebuff restart). Port trap đã biết: API must own 3001, Vite 3000 (xem HANDOFF mục 3).

## Environment change to be aware of

Early turns ran in Freebuff Cloud (Linux VM, no local access). **The chat has since moved to the user's Windows machine** — the agent can now run commands, dev servers, spike, and browser previews directly on `D:\`. User previously asked repeatedly "why can't you run it" — do not repeat the old cloud limitation; just run things. Two backend/model changes since: turns were previously Nemotron 3.5 Lightning, now mimo/mimo-v2.5.

## Current task: deploy fully online — research done, awaiting user go-ahead

User asked: "cách deploy website chạy hoàn toàn online". Research completed (gravity_index search + researcher-web, sources: playwright.dev/docs/docker, cloud.google.com/run docs, fly.io/railway/render pricing):

- **Constraint**: server needs Playwright + Chromium → must be a Linux container (Cloud Run/VPS). Freebuff Sites / static hosts (Cloudflare Workers) CANNOT run it.
- **Recommended plan — single container on Cloud Run**: merge web+server: Fastify serves `web/dist` static (same origin → no CORS, no Firebase rewrite), Dockerfile builds shared→server→web in one image. Deploy with `gcloud builds submit --tag ... .` (user has NO local Docker) + `--set-secrets GEMINI_API_KEY=...`, region asia-southeast1, 2Gi RAM. Free tier ≈ enough for low traffic; SSE request cap 60 min (fine); disk ephemeral.
- **Open decision (asked twice, user has NOT answered)**: production Blooket auto-publish? (a) **CSV-only in production, publish local-only — recommended**, (b) pack `server/playwright-profile` into a secret and unpack at boot, (c) cheap VPS (Civo ~$10.9/mo) if they want always-on publish with persistent login profile.
- User was given 3 next-step choices: code Phase 6 merged container / CSV-only+Phase 6 / set up GCP. Nothing chosen yet.

## Phase 6 code work queued (what "làm đi" means)

1. Fastify serves `web/dist` (static + SPA fallback) and Dockerfile builds all 3 workspaces (currently only server).
2. Missing hardening from PLAN §Phase 6: IP rate limit, upload size limit, server-side Turnstile verify (field exists but unverified), `/admin` UI (only GET JSON exists), job log.
3. Tests/build: `npm test`, `npm run build --workspaces`; cannot `docker build` locally (no Docker) — image builds on Cloud Build.

## Secrets hygiene (already known, re-check)

- Gemini API key was pasted in chat once → user was told to revoke/rotate; current key lives only in `quizgenerator/.env` (git-ignored). **Never echo it.**
- Blooket password noted as previously leaked in PLAN → user told to rotate.
- `.gitignore` blocks `.env`, `node_modules/`, `playwright-profile/` — verify with `git check-ignore` before any commit; never `git add -A` from repo root (outer repo is quicknotes).

## Suggested skills for the next agent

- **`impeccable`** — when doing the `/admin` UI or any frontend polish in Phase 6.
- **`handoff`** — to refresh this document if the deploy decision takes multiple sessions.
- No skill covers Cloud Run / Playwright deploy; do it directly. For current pricing/docs beyond the research above, use researcher-web.
