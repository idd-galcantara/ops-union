import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ops-union.theme.v1';

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function useThemeController() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [themeReady, setThemeReady] = useState(() => typeof window === 'undefined' || !Boolean(window.opsFlowDesktop));

  useEffect(() => {
    const desktop = window.opsFlowDesktop;
    if (!desktop) {
      setThemeReady(true);
      return;
    }

    let active = true;
    void desktop.loadTheme()
      .then((storedTheme) => {
        if (active && storedTheme) setTheme(storedTheme);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setThemeReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable in restricted browser profiles.
    }

    if (window.opsFlowDesktop) {
      void window.opsFlowDesktop.saveTheme(theme).catch(() => undefined);
    }
  }, [theme, themeReady]);

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  return { theme, themeReady, toggleTheme };
}