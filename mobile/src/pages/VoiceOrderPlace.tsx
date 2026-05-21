import { useNavigate, useParams } from 'react-router-dom';
import VoiceOrderForm from '../components/VoiceOrderForm';

/** Standalone voice order page (also available as a tab on Cart). */
export default function VoiceOrderPlace() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();

    return (
        <div className="page fade-in" style={{ paddingBottom: 100 }}>
            <div className="page-header">
                <h1>Place Voice Order</h1>
            </div>
            <VoiceOrderForm onSwitchToCart={() => navigate(`/${shopSlug}/cart`)} />
        </div>
    );
}
