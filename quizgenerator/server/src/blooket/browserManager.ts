import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  getProfileDir,
  checkBlooketSession,
  loadSessionInfo,
  saveSessionInfo,
  type SessionInfo,
  type SessionState,
} from './session.js';
import { adminLink, notifyAdmin } from '../notify/telegram.js';
import { BLOOKET_SELECTORS } from './selectors.js';

const IDLE_CLOSE_MS = 10 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Owns the single persistent Chromium context for the Blooket profile.
 *
 * Chromium locks its profile directory, so publishes and session checks must never
 * run at the same time: every caller goes through `withPage`, which runs tasks one
 * after another on the same window. The context stays open between tasks (no new
 * window per publish) and closes itself after 10 idle minutes to free memory.
 */
class BrowserManager {
  private context: BrowserContext | null = null;
  private launching: Promise<BrowserContext> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;
  private info: SessionInfo | null = null;

  get sessionInfo(): SessionInfo {
    // Loaded on first use so STATE_DIR from .env is already in place.
    this.info ??= loadSessionInfo();
    return { ...this.info };
  }

  setSessionState(state: SessionState): void {
    const previous = this.sessionInfo.state;
    this.info = { state, checkedAt: new Date().toISOString() };
    saveSessionInfo(this.info);

    if (state === 'expired' && previous !== 'expired') {
      void notifyAdmin(
        `🔒 Blooket session expired — publishing is paused (users can still download CSV).\nLog in again: ${adminLink()}`,
        { throttleKey: 'session-expired', throttleMs: 6 * 60 * 60 * 1000 },
      );
    } else if (state === 'active' && (previous === 'expired' || previous === 'logging-in')) {
      void notifyAdmin('✅ Blooket session restored — publishing is back on.');
    }
  }

  /** Run `task` with exclusive use of the shared Blooket page. */
  withPage<T>(task: (page: Page) => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      this.clearIdleTimer();
      try {
        const page = await this.getPage();
        return await task(page);
      } finally {
        this.armIdleTimer();
      }
    });
    // Keep the chain alive after a failure so the next task still runs.
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Open the dashboard and record whether the stored login still works. */
  checkSession(): Promise<SessionState> {
    return this.withPage(async (page) => {
      const loggedIn = await checkBlooketSession(page);
      if (loggedIn === null) throw new Error('Could not reach Blooket to check the session');
      const state: SessionState = loggedIn ? 'active' : 'expired';
      this.setSessionState(state);
      return state;
    });
  }

  /**
   * Opens the Blooket login page in the shared window and waits for a human to
   * finish it (on the server that is the noVNC view in /admin). Returns at once;
   * the state moves logging-in → active, or → expired after 10 minutes.
   * Returns false when a login is already running.
   */
  startLogin(): boolean {
    if (this.sessionInfo.state === 'logging-in') return false;
    this.setSessionState('logging-in');

    this.withPage(async (page) => {
      // The stored session may still be fine (e.g. the admin clicked by mistake).
      await page.goto(BLOOKET_SELECTORS.login.url, { waitUntil: 'domcontentloaded' });
      await page.bringToFront().catch(() => {});
      await page.waitForURL((url) => url.hostname.includes('dashboard.blooket.com'), {
        timeout: LOGIN_WINDOW_MS,
      });
      this.setSessionState('active');
    }).catch((err: any) => {
      console.warn(`Blooket login did not complete: ${String(err.message).split('\n')[0]}`);
      this.setSessionState('expired');
    });
    return true;
  }

  async close(): Promise<void> {
    this.clearIdleTimer();
    const ctx = this.context;
    this.context = null;
    if (ctx) await ctx.close().catch(() => {});
  }

  private async getPage(): Promise<Page> {
    const ctx = await this.getContext();
    const pages = ctx.pages();
    const page = pages.length > 0 ? pages[0] : await ctx.newPage();
    // Give a human time to type credentials and pass human verification.
    page.setDefaultTimeout(90000);
    page.setDefaultNavigationTimeout(90000);
    return page;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    if (!this.launching) {
      this.launching = this.launch().finally(() => {
        this.launching = null;
      });
    }
    return this.launching;
  }

  private async launch(): Promise<BrowserContext> {
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    // BLOOKET_BROWSER_CHANNEL=chrome launches the real installed Chrome instead of
    // Playwright's Chromium (local only — the Docker image has no Chrome binary).
    const channel = process.env.BLOOKET_BROWSER_CHANNEL || undefined;
    const ctx = await chromium.launchPersistentContext(getProfileDir(), {
      headless: isHeadless,
      channel,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    // The user may close the window by hand; forget the context so the next task relaunches.
    ctx.on('close', () => {
      if (this.context === ctx) this.context = null;
    });
    this.context = ctx;
    return ctx;
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.close().catch(() => {});
    }, IDLE_CLOSE_MS);
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

export const browserManager = new BrowserManager();
