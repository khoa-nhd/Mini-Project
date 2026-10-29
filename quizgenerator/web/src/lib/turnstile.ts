/**
 * Cloudflare Turnstile tokens for the protected API calls (generate, publish).
 *
 * The widget runs in "interaction-only" mode: invisible for most visitors, shown
 * bottom-right only when Cloudflare wants a click. Tokens are single-use, so every
 * protected request asks for a fresh one. Without VITE_TURNSTILE_SITE_KEY (local
 * dev) no token is sent and the server skips the check when it has no secret.
 */

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const TOKEN_TIMEOUT_MS = 60_000;

let widgetId: string | null = null;
let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;

function waitForScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (window.turnstile) return resolve(window.turnstile);
      if (Date.now() - started > 15_000) {
        return reject(new Error('Human verification failed to load. Check your connection and reload.'));
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

function ensureWidget(api: TurnstileApi): string {
  if (widgetId) return widgetId;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.right = '16px';
  container.style.bottom = '16px';
  container.style.zIndex = '1000';
  document.body.appendChild(container);

  widgetId = api.render(container, {
    sitekey: SITE_KEY,
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => {
      pending?.resolve(token);
      pending = null;
    },
    'error-callback': () => {
      pending?.reject(new Error('Human verification failed. Reload the page and try again.'));
      pending = null;
    },
  });
  return widgetId;
}

/** Fresh token, or undefined when Turnstile is not configured for this build. */
export async function getTurnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const api = await waitForScript();
  const id = ensureWidget(api);

  const token = new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    setTimeout(() => {
      if (pending?.resolve === resolve) {
        pending = null;
        reject(new Error('Human verification timed out. Try again.'));
      }
    }, TOKEN_TIMEOUT_MS);
  });

  api.reset(id);
  api.execute(id);
  return token;
}
