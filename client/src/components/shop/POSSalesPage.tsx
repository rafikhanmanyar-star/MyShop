import React from 'react';
import { InventoryProvider } from '../../context/InventoryContext';
import { LoyaltyProvider } from '../../context/LoyaltyContext';
import POScreen from '../pos/POScreen';

function POSSalesPage() {
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <InventoryProvider>
                <LoyaltyProvider>
                    <POScreen />
                </LoyaltyProvider>
            </InventoryProvider>
        </div>
    );
}

export default POSSalesPage;
