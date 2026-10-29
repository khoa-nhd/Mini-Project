import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'playwright';

// Read lazily: ESM imports run before index.ts loads .env, so module-level
// constants would never see values from the .env file.

/** Persistent Chromium profile holding the Blooket login (git-ignored). */
export function getProfileDir(): string {
  return path.resolve(
    process.env.BLOOKET_PROFILE_DIR || path.join(process.cwd(), 'playwright-profile'),
  );
}

/** Where the session state file lives; `.tmp/` is git-ignored. */
export function getStateDir(): string {
  return path.resolve(process.env.STATE_DIR || path.join(process.cwd(), '.tmp', 'state'));
}

export type SessionState = 'unknown' | 'active' | 'expired' | 'logging-in';

export interface SessionInfo {
  state: SessionState;
  checkedAt: string | null;
}

/** Thrown when publishing needs a login that nobody is around to perform. */
export class SessionExpiredError extends Error {
  readonly code = 'SESSION_EXPIRED';
  constructor(message = 'Blooket session expired. An admin needs to log in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/**
 * In production nobody watches the browser window, so a publish must fail fast
 * on an expired session. Locally the old behaviour (wait for a manual login in
 * the opened window) stays the default.
 */
export function interactiveLoginAllowed(): boolean {
  const flag = process.env.BLOOKET_INTERACTIVE_LOGIN;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** Publishing is offered unless the session is known to be unusable. */
export function isPublishAvailable(state: SessionState): boolean {
  if (interactiveLoginAllowed()) return true;
  return state === 'active' || state === 'unknown';
}

export function loadSessionInfo(stateDir = getStateDir()): SessionInfo {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir, 'session.json'), 'utf-8'));
    const valid: SessionState[] = ['unknown', 'active', 'expired', 'logging-in'];
    // A login cannot survive a restart, so a stored 'logging-in' means unknown.
    const state: SessionState =
      valid.includes(raw.state) && raw.state !== 'logging-in' ? raw.state : 'unknown';
    return { state, checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null };
  } catch {
    return { state: 'unknown', checkedAt: null };
  }
}

export function saveSessionInfo(info: SessionInfo, stateDir = getStateDir()): void {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify(info, null, 2));
  } catch (err: any) {
    console.warn(`Could not persist session state: ${err.message}`);
  }
}

export async function checkBlooketSession(page: Page): Promise<boolean> {
  try {
    await page.goto('https://dashboard.blooket.com', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('id.blooket.com') || url.includes('/login') || url.includes('challenge')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
