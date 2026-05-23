import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

type Tile = {
    to: string;
    title: string;
    description: string;
    gradient: string;
    icon: ReactNode;
};

function IconFeedback() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 10h.01" />
            <path d="M12 10h.01" />
            <path d="M16 10h.01" />
        </svg>
    );
}

function IconBudget() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 0 1-1v-2Z" />
            <path d="M18 5h.01" />
            <path d="M19 11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" />
            <path d="M3 11h16" />
            <path d="M7 15h.01" />
            <path d="M11 15h4" />
        </svg>
    );
}

function IconMyMenu() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M7 8h4" />
            <path d="M7 12h10" />
            <path d="M7 16h7" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
        </svg>
    );
}

function IconAppearance() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m4.93 19.07 1.41-1.41" />
            <path d="m17.66 6.34 1.41-1.41" />
        </svg>
    );
}

function IconUpdates() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
        </svg>
    );
}

function IconRecipes() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M8 7h8" />
            <path d="M8 11h8" />
            <path d="M8 15h5" />
        </svg>
    );
}

export default function UtilitiesHubPage() {
    const { shopSlug } = useParams();
    if (!shopSlug) return null;

    const base = `/${shopSlug}`;
    const tiles: Tile[] = [
        {
            to: `${base}/feedback`,
            title: 'Feedback & Suggestions',
            description: 'Help us improve your experience',
            gradient: 'linear-gradient(145deg, #db2777 0%, #ec4899 45%, #f472b6 100%)',
            icon: <IconFeedback />,
        },
        {
            to: `${base}/budget`,
            title: 'Budget Planner',
            description: 'Track spending and meal budgets',
            gradient: 'linear-gradient(145deg, #0d9488 0%, #14b8a6 45%, #2dd4bf 100%)',
            icon: <IconBudget />,
        },
        {
            to: `${base}/my-menu`,
            title: 'My Menu',
            description: 'Weekly plans, shopping & meals',
            gradient: 'linear-gradient(145deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
            icon: <IconMyMenu />,
        },
        {
            to: `${base}/recipes`,
            title: 'Recipes',
            description: 'Browse and save ideas',
            gradient: 'linear-gradient(145deg, #ea580c 0%, #f97316 50%, #fb923c 100%)',
            icon: <IconRecipes />,
        },
        {
            to: `${base}/utilities/appearance`,
            title: 'Appearance & Theme',
            description: 'Light, dark, or system default',
            gradient: 'linear-gradient(145deg, #4c1d95 0%, #6d28d9 50%, #8b5cf6 100%)',
            icon: <IconAppearance />,
        },
        {
            to: `${base}/utilities/updates`,
            title: 'Check for Updates',
            description: `Version ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}`,
            gradient: 'linear-gradient(145deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)',
            icon: <IconUpdates />,
        },
    ];

    return (
        <div className="page fade-in" style={{ paddingBottom: 100 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Utilities</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.45 }}>
                Quick access to planning tools for your kitchen and budget.
            </p>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 14,
                }}
            >
                {tiles.map((tile) => (
                    <Link
                        key={tile.to}
                        to={tile.to}
                        className="utilities-hub-tile"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: '18px 18px',
                            borderRadius: 'var(--radius-xl, 16px)',
                            background: 'var(--surface-elevated, var(--card-bg, #fff))',
                            border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                            textDecoration: 'none',
                            color: 'inherit',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                        }}
                    >
                        <div
                            style={{
                                width: 72,
                                height: 72,
                                borderRadius: 18,
                                background: tile.gradient,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                            }}
                        >
                            {tile.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{tile.title}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{tile.description}</div>
                        </div>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary, var(--text-secondary))', fontSize: 22, lineHeight: 1 }} aria-hidden>
                            ›
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
