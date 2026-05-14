import React from 'react';
import POSSalesContent from './POSSalesContent';

/** POS cart/customer/payments state lives in `POSProvider` at `AppLayout` so it survives route changes. */
function POSSalesPage() {
    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <POSSalesContent />
        </div>
    );
}

export default POSSalesPage;
