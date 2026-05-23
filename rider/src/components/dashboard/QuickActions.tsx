import { useNavigate } from 'react-router-dom';

export function QuickActions({ activeOrderId }: { activeOrderId?: string | null }) {
  const nav = useNavigate();

  return (
    <div className="r-quick-actions">
      <button type="button" className="r-quick-btn" onClick={() => nav('/queue')}>
        Deliveries
        <span>Open queue</span>
      </button>
      <button type="button" className="r-quick-btn" onClick={() => nav('/route')}>
        Smart route
        <span>Optimize stops</span>
      </button>
      <button type="button" className="r-quick-btn" onClick={() => nav('/chat')}>
        Messages
        <span>Dispatch & customer</span>
      </button>
      <button type="button" className="r-quick-btn" onClick={() => nav('/cash')}>
        Cash (COD)
        <span>Collections</span>
      </button>
      <button
        type="button"
        className="r-quick-btn"
        onClick={() => (activeOrderId ? nav(`/order/${activeOrderId}`) : nav('/queue'))}
      >
        Navigate
        <span>{activeOrderId ? 'Active order' : 'Pick an order'}</span>
      </button>
      <button type="button" className="r-quick-btn" onClick={() => nav('/earnings')}>
        Earnings
        <span>Performance</span>
      </button>
    </div>
  );
}
