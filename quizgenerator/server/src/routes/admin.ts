import type { FastifyPluginAsync } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import { jobQueue } from '../queue/jobQueue.js';
import { browserManager } from '../blooket/browserManager.js';
import { readJobLog } from '../queue/jobLog.js';
import { notifyAdmin, telegramConfigured } from '../notify/telegram.js';
import {
  ADMIN_COOKIE,
  adminCookieHeader,
  createAdminToken,
  isAdminRequest,
  passwordMatches,
  readCookie,
  verifyAdminToken,
  ADMIN_SESSION_MS,
} from '../admin/auth.js';
import { renderAdminPage } from '../admin/page.js';

export { passwordMatches };

const PLACEHOLDER_PASSWORDS = new Set(['admin', 'change-this-in-production']);
const MIN_PRODUCTION_LENGTH = 16;

/** Routes reachable without a session: the page itself (shows the login form) and login/logout. */
const PUBLIC_ADMIN_PATHS = new Set(['/admin', '/admin/', '/admin/login', '/admin/logout']);

/**
 * Returns the configured admin password, or null when the admin area must stay locked.
 * There is deliberately no fallback default: a missing password locks /admin.
 */
export function resolveAdminPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  const password = env.ADMIN_PASSWORD?.trim();
  if (!password || PLACEHOLDER_PASSWORDS.has(password)) return null;
  if (env.NODE_ENV === 'production' && password.length < MIN_PRODUCTION_LENGTH) return null;
  return password;
}

/** Fail closed: production must not start with a missing, placeholder or short admin password. */
export function assertAdminConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && resolveAdminPassword(env) === null) {
    throw new Error(
      `ADMIN_PASSWORD must be set to a non-placeholder value of at least ${MIN_PRODUCTION_LENGTH} characters in production.`,
    );
  }
}

/** websockify (noVNC) address inside the container, e.g. http://127.0.0.1:6080. Unset locally. */
export function vncUpstream(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.VNC_UPSTREAM?.trim() || null;
}

export const adminRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/admin')) return;

    const adminPassword = resolveAdminPassword();
    if (adminPassword === null) {
      return reply.status(503).send({ error: 'Admin area is disabled: ADMIN_PASSWORD is not set' });
    }

    const pathname = request.url.split('?')[0];
    if (PUBLIC_ADMIN_PATHS.has(pathname)) return;

    if (!isAdminRequest(request, adminPassword)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.get('/admin', async (request, reply) => {
    const password = resolveAdminPassword()!;
    const authed = verifyAdminToken(readCookie(request.headers.cookie, ADMIN_COOKIE), password);
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Frame-Options', 'DENY')
      .type('text/html; charset=utf-8')
      .send(renderAdminPage({ authed }));
  });

  fastify.post(
    '/admin/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const password = resolveAdminPassword()!;
      const given = (request.body as { password?: unknown } | undefined)?.password;
      if (typeof given !== 'string' || !passwordMatches(given, password)) {
        return reply.status(403).send({ error: 'Wrong password' });
      }
      return reply
        .header('Set-Cookie', adminCookieHeader(createAdminToken(password), ADMIN_SESSION_MS))
        .send({ ok: true });
    },
  );

  fastify.post('/admin/logout', async (_request, reply) => {
    return reply.header('Set-Cookie', adminCookieHeader('', 0)).send({ ok: true });
  });

  fastify.get('/admin/status', async (_request, reply) => {
    const recentJobs = jobQueue.getRecentJobs();
    return reply.send({
      serverTime: new Date().toISOString(),
      session: browserManager.sessionInfo,
      vncEnabled: vncUpstream() !== null,
      recentJobsCount: recentJobs.length,
      recentJobs,
      // Survives restarts, unlike the in-memory list above.
      jobLog: readJobLog(20),
      telegramConfigured: telegramConfigured(),
    });
  });

  fastify.post('/admin/notify/test', async (_request, reply) => {
    const sent = await notifyAdmin('🧪 Test message from Quiz Generator admin.');
    return reply.send({ sent, telegramConfigured: telegramConfigured() });
  });

  // Opens the dashboard in the shared browser window (queued behind any running publish).
  fastify.post('/admin/session/check', async (_request, reply) => {
    try {
      const state = await browserManager.checkSession();
      return reply.send({ session: { ...browserManager.sessionInfo, state } });
    } catch (err: any) {
      return reply.status(502).send({ error: err.message, session: browserManager.sessionInfo });
    }
  });

  // Opens the Blooket login page; the admin completes it through the noVNC view.
  fastify.post('/admin/session/login', async (_request, reply) => {
    const started = browserManager.startLogin();
    return reply.status(started ? 202 : 409).send({
      started,
      session: browserManager.sessionInfo,
    });
  });

  // noVNC (web client + WebSocket) from websockify, behind the same admin check above.
  const upstream = vncUpstream();
  if (upstream) {
    await fastify.register(httpProxy, {
      upstream,
      prefix: '/admin/vnc',
      websocket: true,
    });
  }
};
