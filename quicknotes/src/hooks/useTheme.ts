import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { updateUserSettings } from '../services/firebaseSync';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'quicknotes-theme-mode';

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage unavailable
  }
  return 'system';
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Theme mode comes from the user's settings (synced), falling back to the last local choice. */
export function useTheme() {
  const userTheme = useAppStore((state) => state.user?.settings.theme);
  const theme: ThemeMode = userTheme ?? readStoredTheme();
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setSystemTheme(getSystemTheme());
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // storage unavailable
    }
  }, [theme, resolvedTheme]);

  const setThemeMode = useCallback((newTheme: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // storage unavailable
    }
    if (useAppStore.getState().user) {
      updateUserSettings({ theme: newTheme }).catch((error) => console.error('Failed to save theme:', error));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const themes: ThemeMode[] = ['light', 'dark', 'system'];
    setThemeMode(themes[(themes.indexOf(theme) + 1) % themes.length]);
  }, [theme, setThemeMode]);

  return { theme, resolvedTheme, setThemeMode, toggleTheme };
}
