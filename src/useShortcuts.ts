import { useEffect, useState } from 'react';

const preferenceKey = 'streakify.keyboard-shortcuts';

export function useShortcuts(ready: boolean, onKey: (key: string) => boolean) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== 'off'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* Session-only preference when storage is unavailable. */ }
  }, [enabled]);
  useEffect(() => {
    if (!ready || !enabled) return;
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [role="combobox"]'))) return;
      if (onKey(event.key.toLowerCase())) event.preventDefault();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [enabled, ready, onKey]);
  return { enabled, setEnabled };
}
