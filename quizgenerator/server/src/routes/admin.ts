import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { jobQueue } from '../queue/jobQueue.js';
import { browserManager } from '../blooket/browserManager.js';
import { readJobLog } from '../queue/jobLog.js';
import { notifyAdmin, telegramConfigured } from '../notify/telegram.js';

const PLACEHOLDER_PASSWORDS = new Set(['admin', 'change-this-in-production']);
const MIN_PRODUCTION_LENGTH = 16;

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

/** Constant-time comparison so the password cannot be guessed byte by byte from timing. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export const adminRoute: FastifyPluginAsync = async (fastify) => {
  // Simple auth hook for /admin/*
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/admin')) {
      const adminPassword = resolveAdminPassword();
      if (adminPassword === null) {
        return reply.status(503).send({ error: 'Admin area is disabled: ADMIN_PASSWORD is not set' });
      }

      const authHeader = request.headers['authorization'];
      if (!authHeader) {
        reply.header('WWW-Authenticate', 'Basic realm="QuizGenerator Admin"');
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const match = authHeader.match(/^Basic\s+(.*)$/);
      if (!match) {
        return reply.status(401).send({ error: 'Invalid auth header format' });
      }

      const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
      // Passwords may contain ':' — only the first one separates the username.
      const password = decoded.slice(decoded.indexOf(':') + 1);

      if (!passwordMatches(password, adminPassword)) {
        return reply.status(403).send({ error: 'Forbidden: Incorrect password' });
      }
    }
  });

  fastify.get('/admin/status', async (_request, reply) => {
    const recentJobs = jobQueue.getRecentJobs();
    return reply.send({
      serverTime: new Date().toISOString(),
      session: browserManager.sessionInfo,
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
    const state = await browserManager.checkSession();
    return reply.send({ session: { ...browserManager.sessionInfo, state } });
  });
};
