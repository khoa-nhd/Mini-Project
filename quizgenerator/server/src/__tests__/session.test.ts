import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isPublishAvailable,
  loadSessionInfo,
  saveSessionInfo,
} from '../blooket/session.js';
import { assertAdminConfig, passwordMatches, resolveAdminPassword } from '../routes/admin.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Blooket session state', () => {
  it('round-trips state and never restores a stale logging-in', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-state-'));
    try {
      expect(loadSessionInfo(dir)).toEqual({ state: 'unknown', checkedAt: null });

      saveSessionInfo({ state: 'expired', checkedAt: '2026-10-29T00:00:00.000Z' }, dir);
      expect(loadSessionInfo(dir).state).toBe('expired');

      saveSessionInfo({ state: 'logging-in', checkedAt: null }, dir);
      expect(loadSessionInfo(dir).state).toBe('unknown');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pauses publishing on an expired session only when nobody can log in interactively', () => {
    process.env.BLOOKET_INTERACTIVE_LOGIN = 'false';
    expect(isPublishAvailable('expired')).toBe(false);
    expect(isPublishAvailable('logging-in')).toBe(false);
    expect(isPublishAvailable('unknown')).toBe(true);
    expect(isPublishAvailable('active')).toBe(true);

    process.env.BLOOKET_INTERACTIVE_LOGIN = 'true';
    expect(isPublishAvailable('expired')).toBe(true);
  });

  it('defaults to interactive login outside production only', () => {
    delete process.env.BLOOKET_INTERACTIVE_LOGIN;
    process.env.NODE_ENV = 'production';
    expect(isPublishAvailable('expired')).toBe(false);
    process.env.NODE_ENV = 'development';
    expect(isPublishAvailable('expired')).toBe(true);
  });
});

describe('Admin password', () => {
  it('has no default and rejects placeholders', () => {
    expect(resolveAdminPassword({})).toBeNull();
    expect(resolveAdminPassword({ ADMIN_PASSWORD: 'admin' })).toBeNull();
    expect(resolveAdminPassword({ ADMIN_PASSWORD: 'change-this-in-production' })).toBeNull();
    expect(resolveAdminPassword({ ADMIN_PASSWORD: 'short-dev-pw' })).toBe('short-dev-pw');
  });

  it('fails closed in production without a strong password', () => {
    expect(() => assertAdminConfig({ NODE_ENV: 'production' })).toThrow(/ADMIN_PASSWORD/);
    expect(() =>
      assertAdminConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: 'short-dev-pw' }),
    ).toThrow(/ADMIN_PASSWORD/);
    expect(() =>
      assertAdminConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: 'a-long-enough-password' }),
    ).not.toThrow();
    expect(() => assertAdminConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('compares passwords exactly, including ones with colons', () => {
    expect(passwordMatches('a:b:c', 'a:b:c')).toBe(true);
    expect(passwordMatches('a:b', 'a:b:c')).toBe(false);
  });
});
