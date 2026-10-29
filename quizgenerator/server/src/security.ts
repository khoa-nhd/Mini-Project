import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

const ONE_DAY = '1 day';

function envInt(name: string, fallback: number): number {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Per-route limits, keyed by client IP (Caddy's X-Forwarded-For via trustProxy). */
export function rateLimits() {
  return {
    generate: { max: envInt('RATE_LIMIT_GENERATE_PER_DAY', 30), timeWindow: ONE_DAY },
    refine: { max: envInt('RATE_LIMIT_REFINE_PER_DAY', 60), timeWindow: ONE_DAY },
    publish: { max: envInt('RATE_LIMIT_PUBLISH_PER_DAY', 10), timeWindow: ONE_DAY },
  };
}

/** Registers the plugin without a global limit; routes opt in via `config.rateLimit`. */
export async function registerRateLimit(server: FastifyInstance): Promise<void> {
  await server.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: `Daily limit reached. Try again in ${context.after}.`,
    }),
  });
}

/** Upload file types the extractors understand. */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  'pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md', 'csv',
];
export const MAX_UPLOAD_FILES = 10;

export function isAllowedUpload(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
}

/* ---------------- Cloudflare Turnstile ---------------- */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TURNSTILE_SECRET?.trim());
}

/** Fail closed: production must not run the paid endpoints without bot protection. */
export function assertTurnstileConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && !turnstileEnabled(env)) {
    throw new Error('TURNSTILE_SECRET must be set in production.');
  }
}

export interface TurnstileResult {
  ok: boolean;
  error?: string;
}

/**
 * Checks a Turnstile token with Cloudflare. Without a secret (local dev) every
 * request passes; tokens are single-use, so each protected call needs a fresh one.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (!turnstileEnabled()) return { ok: true };
  if (!token) return { ok: false, error: 'Human verification is missing. Reload the page and try again.' };

  try {
    const res = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET,
        response: token,
        remoteip: remoteIp,
      }),
    });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true };
    console.warn(`Turnstile rejected a token: ${(data['error-codes'] || []).join(', ')}`);
    return { ok: false, error: 'Human verification failed. Reload the page and try again.' };
  } catch (err: any) {
    console.warn(`Turnstile verification unavailable: ${err.message}`);
    return { ok: false, error: 'Human verification is unavailable right now. Try again shortly.' };
  }
}
