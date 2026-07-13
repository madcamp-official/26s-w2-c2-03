import { useCallback, useState } from 'react';

const STORAGE_KEY = 'zonemate-theme';

// 첫 페인트 전에 한 번 호출해서(main.jsx) 저장된 테마를 즉시 적용한다 —
// React가 마운트되길 기다리면 라이트로 잠깐 번쩍였다가 다크로 바뀌는 게 보인다.
// 저장된 값이 없으면 항상 라이트가 기본값(OS 다크모드 설정과 무관 — 사용자가
// 토글을 직접 눌러야만 다크로 바뀐다).
export function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  document.documentElement.setAttribute('data-theme', stored === 'dark' ? 'dark' : 'light');
}

export function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light',
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
