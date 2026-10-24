import { useAppStore } from '../stores/appStore';

// Type for the (Chromium-only) beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const VISITS_KEY = 'quicknotes_visits';
const DISMISSED_KEY = 'quicknotes_install_dismissed';
// Only nag returning users: show the banner from the 2nd visit on
const MIN_VISITS = 2;

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function readNumber(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

/** Call once at startup, before React renders, so the event is never missed. */
export function setupInstallPrompt() {
  const visits = readNumber(VISITS_KEY) + 1;
  writeValue(VISITS_KEY, String(visits));

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    // Dismissal is remembered for 30 days
    const dismissedAt = readNumber(DISMISSED_KEY);
    const recentlyDismissed = Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000;
    if (visits >= MIN_VISITS && !recentlyDismissed) {
      useAppStore.getState().setShowInstallPrompt(true);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    useAppStore.getState().setShowInstallPrompt(false);
  });
}

export async function promptInstall(): Promise<void> {
  useAppStore.getState().setShowInstallPrompt(false);
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'dismissed') writeValue(DISMISSED_KEY, String(Date.now()));
}

export function dismissInstallPrompt() {
  useAppStore.getState().setShowInstallPrompt(false);
  writeValue(DISMISSED_KEY, String(Date.now()));
}
