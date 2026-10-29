import { describe, it, expect } from 'vitest';
import {
  ADMIN_SESSION_MS,
  adminCookieHeader,
  createAdminToken,
  readCookie,
  verifyAdminToken,
} from '../admin/auth.js';
import { renderAdminPage } from '../admin/page.js';
import { sessionCheckHours } from '../blooket/sessionScheduler.js';

describe('Admin session cookie', () => {
  it('verifies its own token until it expires', () => {
    const now = 1_000_000;
    const token = createAdminToken('pw-1', now);
    expect(verifyAdminToken(token, 'pw-1', now + 1000)).toBe(true);
    expect(verifyAdminToken(token, 'pw-1', now + ADMIN_SESSION_MS + 1)).toBe(false);
  });

  it('rejects tampering and tokens signed with another password', () => {
    const now = Date.now();
    const token = createAdminToken('pw-1', now);
    const [exp, mac] = token.split('.');
    expect(verifyAdminToken(`${Number(exp) + 10_000_000}.${mac}`, 'pw-1', now)).toBe(false);
    expect(verifyAdminToken(token, 'pw-2', now)).toBe(false);
    expect(verifyAdminToken('garbage', 'pw-1', now)).toBe(false);
    expect(verifyAdminToken(undefined, 'pw-1', now)).toBe(false);
  });

  it('parses cookies and builds a strict, http-only cookie', () => {
    expect(readCookie('a=1; qg_admin=x%2Ey; b=2', 'qg_admin')).toBe('x.y');
    expect(readCookie('qg_admin_other=1', 'qg_admin')).toBeUndefined();
    const header = adminCookieHeader('v', 60_000);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/admin');
    expect(header).toContain('Max-Age=60');
  });
});

describe('Admin page', () => {
  it('shows only the login form when signed out', () => {
    const html = renderAdminPage({ authed: false });
    expect(html).toContain('id="login"');
    expect(html).not.toContain('Recent publishes');
  });

  it('renders dynamic values with textContent, never innerHTML', () => {
    const html = renderAdminPage({ authed: true });
    expect(html).toContain('Recent publishes');
    expect(html).not.toContain('innerHTML');
  });
});

describe('Session check schedule', () => {
  it('defaults to 12h in production and off in development', () => {
    expect(sessionCheckHours({ NODE_ENV: 'production' })).toBe(12);
    expect(sessionCheckHours({ NODE_ENV: 'development' })).toBe(0);
    expect(sessionCheckHours({ NODE_ENV: 'development', SESSION_CHECK_HOURS: '6' })).toBe(6);
    expect(sessionCheckHours({ NODE_ENV: 'production', SESSION_CHECK_HOURS: '0' })).toBe(0);
    expect(sessionCheckHours({ SESSION_CHECK_HOURS: 'abc' })).toBe(0);
  });
});
