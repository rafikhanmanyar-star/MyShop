import { useCallback, useRef } from 'react';

/**
 * Fires `onLongPress` after `delayMs` while pointer is down.
 * Call `clear()` from pointer up/cancel to allow normal clicks.
 */
export function useLongPress(onLongPress: () => void, delayMs = 500) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = useCallback(() => {
        if (timerRef.current != null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback(() => {
        clear();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            onLongPress();
        }, delayMs);
    }, [clear, onLongPress, delayMs]);

    return {
        onPointerDown: start,
        onPointerUp: clear,
        onPointerLeave: clear,
        onPointerCancel: clear,
        clear,
    };
}
