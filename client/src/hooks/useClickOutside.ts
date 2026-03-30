import { RefObject, useEffect, useRef } from 'react';

/**
 * Closes floating UI (combobox, popover) when the user presses outside the container.
 * Uses pointerdown in the capture phase so the panel closes on the first interaction outside,
 * before focus/blur ordering issues with list items.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  enabled: boolean
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const handle = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', handle, true);
    return () => document.removeEventListener('pointerdown', handle, true);
  }, [enabled, ref]);
}
