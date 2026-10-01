'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'loghr-theme';

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    setPrefState(readPref());
  }, []);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setPrefState(next);
    apply(next);
  }, []);

  return { pref, setPref };
}

export const THEME_LABELS: Record<ThemePref, string> = {
  light: 'Светлая тема',
  dark: 'Тёмная тема',
  system: 'Как в системе',
};
