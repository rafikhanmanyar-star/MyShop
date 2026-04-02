import React from 'react';
import { POSProvider } from '../../context/POSContext';
import { InventoryProvider } from '../../context/InventoryContext';
import { LoyaltyProvider } from '../../context/LoyaltyContext';
import POSSalesContent from './POSSalesContent';

function POSSalesPage() {
    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <InventoryProvider>
                <LoyaltyProvider>
                    <POSProvider>
                        <POSSalesContent />
                    </POSProvider>
                </LoyaltyProvider>
            </InventoryProvider>
        </div>
    );
}

export default POSSalesPage;
