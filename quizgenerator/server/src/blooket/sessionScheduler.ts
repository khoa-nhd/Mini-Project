import { browserManager } from './browserManager.js';

const FIRST_CHECK_DELAY_MS = 30 * 1000;

/**
 * Hours between background session checks. Default 12 in production and off in
 * development, where a check would pop a browser window on your desktop.
 */
export function sessionCheckHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SESSION_CHECK_HOURS;
  if (raw !== undefined && raw.trim() !== '') {
    const hours = Number(raw);
    return Number.isFinite(hours) && hours > 0 ? hours : 0;
  }
  return env.NODE_ENV === 'production' ? 12 : 0;
}

/**
 * Opens the Blooket dashboard periodically so an expired login is noticed (and
 * reported on Telegram) before a user tries to publish. Visiting the dashboard
 * may also keep a sliding session alive. Returns a stop function.
 */
export function startSessionScheduler(): () => void {
  const hours = sessionCheckHours();
  if (hours === 0) return () => {};

  const run = () => {
    // Never interrupt an admin who is logging in right now.
    if (browserManager.sessionInfo.state === 'logging-in') return;
    browserManager.checkSession().catch((err: any) => {
      console.warn(`Scheduled Blooket session check failed: ${err.message}`);
    });
  };

  const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
  const interval = setInterval(run, hours * 60 * 60 * 1000);
  first.unref();
  interval.unref();
  console.log(`Blooket session check every ${hours}h`);
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
