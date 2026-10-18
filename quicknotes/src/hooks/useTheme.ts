import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { updateUserSettings } from '../services/firebaseSync';

export function useTheme() {
  const { user, updateUserSettings: updateSettings } = useAppStore();
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (user?.settings.theme) {
      setTheme(user.settings.theme);
    }
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    
    const applyTheme = (t: 'light' | 'dark' | 'system') => {
      let resolved: 'light' | 'dark';
      
      if (t === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        resolved = t;
      }
      
      setResolvedTheme(resolved);
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
      localStorage.setItem('theme', resolved);
    };

    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setThemeMode = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  }, [updateSettings]);

  const toggleTheme = useCallback(() => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setThemeMode(themes[nextIndex]);
  }, [theme, setThemeMode]);

  return { theme, resolvedTheme, setThemeMode, toggleTheme };
}