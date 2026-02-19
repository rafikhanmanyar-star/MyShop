import React from 'react';
import { POSProvider } from '../../context/POSContext';
import { InventoryProvider } from '../../context/InventoryContext';
import { LoyaltyProvider } from '../../context/LoyaltyContext';
import POSSalesContent from './POSSalesContent';

function POSSalesPage() {
    return (
        <InventoryProvider>
            <LoyaltyProvider>
                <POSProvider>
                    <POSSalesContent />
                </POSProvider>
            </LoyaltyProvider>
        </InventoryProvider>
    );
}

export default POSSalesPage;
