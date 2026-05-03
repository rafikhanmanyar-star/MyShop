import { Navigate, useParams } from 'react-router-dom';

/** Legacy route: /my-menu → weekly menu planner dashboard. */
export default function MyMenuPage() {
    const { shopSlug } = useParams();
    if (!shopSlug) return null;
    return <Navigate to={`/${shopSlug}/menu-planner`} replace />;
}
