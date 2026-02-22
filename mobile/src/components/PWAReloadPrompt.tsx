import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PWAReloadPrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, r) {
            console.log('✅ SW registered:', swUrl);
            // Check for updates every 30 minutes
            if (r) {
                setInterval(() => {
                    r.update();
                }, 30 * 60 * 1000);
            }
        },
        onRegisterError(error) {
            console.error('❌ SW registration error:', error);
        },
    });

    if (!needRefresh) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 16,
            left: 16,
            right: 16,
            background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
            color: 'white',
            borderRadius: 16,
            padding: '16px 20px',
            boxShadow: '0 8px 30px rgba(79,70,229,0.3)',
            zIndex: 10000,
            animation: 'slideDown 0.35s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
        }}>
            <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
            }}>🔄</div>
            <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>New Version Available</p>
                <p style={{ fontSize: 11, opacity: 0.8 }}>Refresh to get the latest features</p>
            </div>
            <button
                onClick={() => updateServiceWorker(true)}
                style={{
                    padding: '8px 16px', borderRadius: 10,
                    background: 'white', color: '#4F46E5',
                    fontSize: 13, fontWeight: 700, border: 'none',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                }}
            >
                Update
            </button>
            <button
                onClick={() => setNeedRefresh(false)}
                style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)', border: 'none',
                    fontSize: 14, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'white',
                    cursor: 'pointer', flexShrink: 0,
                }}
            >✕</button>
        </div>
    );
}
