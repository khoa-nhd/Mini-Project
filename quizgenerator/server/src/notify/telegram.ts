/**
 * Admin notifications via a Telegram bot. Without TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID the message is only logged, so local dev needs no setup.
 */

const lastSentByKey = new Map<string, number>();

export function telegramConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_CHAT_ID?.trim());
}

/** Absolute /admin link for messages, when PUBLIC_URL is known. */
export function adminLink(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.PUBLIC_URL?.trim().replace(/\/$/, '');
  return base ? `${base}/admin` : '/admin';
}

/**
 * Sends `text` to the admin chat. With `throttleKey`, repeats of the same kind of
 * alert are dropped for `throttleMs` (e.g. one "session expired" per 6 hours).
 * Never throws: a failed notification must not break publishing.
 */
export async function notifyAdmin(
  text: string,
  options: { throttleKey?: string; throttleMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const { throttleKey, throttleMs = 0 } = options;
  if (throttleKey) {
    const last = lastSentByKey.get(throttleKey) ?? 0;
    if (Date.now() - last < throttleMs) return false;
    lastSentByKey.set(throttleKey, Date.now());
  }

  if (!telegramConfigured()) {
    console.log(`[notify] ${text}`);
    return false;
  }

  try {
    const res = await fetchImpl(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      console.warn(`Telegram notification failed with HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`Telegram notification failed: ${err.message}`);
    return false;
  }
}

/** Test hook: forget throttling state. */
export function resetNotifyThrottle(): void {
  lastSentByKey.clear();
}
