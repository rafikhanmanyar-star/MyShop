import { useParams } from 'react-router-dom';

export default function MenuPlannerHeader({ title = 'Menu Planner' }: { title?: string }) {
    const { shopSlug } = useParams();

    if (!shopSlug) return null;

    return (
        <header
            className="menu-planner-header"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 16px',
                background: '#fff',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                zIndex: 50,
            }}
        >
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1A1A1A', margin: 0, textAlign: 'center' }}>{title}</h1>
        </header>
    );
}
