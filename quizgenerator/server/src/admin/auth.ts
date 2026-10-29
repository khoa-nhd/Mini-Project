import crypto from 'crypto';
import type { FastifyRequest } from 'fastify';

/**
 * Admin sessions are a signed cookie, not server state: `<expiresAt>.<hmac>`.
 * A cookie (unlike Basic auth) is also sent on the noVNC iframe and its
 * WebSocket, so one login covers the whole admin area. Changing ADMIN_PASSWORD
 * invalidates every issued cookie.
 */

export const ADMIN_COOKIE = 'qg_admin';
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

function signingKey(password: string): Buffer {
  return crypto.createHash('sha256').update(`quizgenerator-admin:${password}`).digest();
}

function sign(expiresAt: number, password: string): string {
  return crypto.createHmac('sha256', signingKey(password)).update(String(expiresAt)).digest('hex');
}

export function createAdminToken(password: string, now = Date.now()): string {
  const expiresAt = now + ADMIN_SESSION_MS;
  return `${expiresAt}.${sign(expiresAt, password)}`;
}

export function verifyAdminToken(token: string | undefined, password: string, now = Date.now()): boolean {
  if (!token) return false;
  const [expiresRaw, mac] = token.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !mac) return false;
  const expected = Buffer.from(sign(expiresAt, password), 'hex');
  const given = Buffer.from(mac, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function adminCookieHeader(value: string, maxAgeMs: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  // Strict: the cookie never rides along on cross-site requests, which also blocks CSRF.
  return `${ADMIN_COOKIE}=${encodeURIComponent(value)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

/** Constant-time comparison so the password cannot be guessed byte by byte from timing. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Valid admin cookie, or a Basic header (handy for curl). */
export function isAdminRequest(request: FastifyRequest, password: string): boolean {
  if (verifyAdminToken(readCookie(request.headers.cookie, ADMIN_COOKIE), password)) return true;

  const match = request.headers.authorization?.match(/^Basic\s+(.*)$/);
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
  // Passwords may contain ':' — only the first one separates the username.
  return passwordMatches(decoded.slice(decoded.indexOf(':') + 1), password);
}
