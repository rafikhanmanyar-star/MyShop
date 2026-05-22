import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

/** Legacy route — all orders (cart + voice) live on My Orders. */
export default function VoiceOrders() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        navigate(`/${shopSlug}/orders`, { replace: true });
    }, [shopSlug, navigate]);

    return null;
}
