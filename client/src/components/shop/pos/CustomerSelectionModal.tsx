
import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { ICONS, CURRENCY } from '../../../constants';
import { usePOS } from '../../../context/POSContext';
import { ContactsApiRepository } from '../../../services/api/repositories/contactsApi';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { POSCustomer } from '../../../types/pos';
import { Contact } from '../../../types';

interface CustomerSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CustomerSelectionModal: React.FC<CustomerSelectionModalProps> = ({ isOpen, onClose }) => {
    const { setCustomer } = usePOS();
    const { members } = useLoyalty();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    const contactsApi = new ContactsApiRepository();

    useEffect(() => {
        if (isOpen) {
            fetchContacts();
        }
    }, [isOpen]);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const data = await contactsApi.findAll();
            setContacts(data);
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (contact: Contact) => {
        // Find if this contact is a loyalty member
        const loyaltyMember = members.find(m => m.customerId === contact.id || m.phone === contact.contactNo);

        const posCustomer: POSCustomer = {
            id: contact.id,
            name: contact.name,
            phone: contact.contactNo || 'N/A',
            email: undefined, // Add if available
            points: loyaltyMember?.pointsBalance || 0,
            creditLimit: 0, // Default or fetch from somewhere
            balance: 0, // Default or fetch from somewhere
            tier: loyaltyMember?.tier || 'Standard'
        };

        setCustomer(posCustomer);
        onClose();
    };

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.contactNo && c.contactNo.includes(searchQuery))
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={<div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl pos-gradient-dark flex items-center justify-center text-white shadow-none">
                    {ICONS.user}
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 leading-none tracking-tight">Customer Directory</h2>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Global Database Access</span>
                    </div>
                </div>
            </div>}
            size="lg"
        >
            <div className="space-y-6">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 20 })}
                    </div>
                    <input
                        type="text"
                        placeholder="Live search by name, contact or loyalty ID..."
                        className="w-full pl-14 pr-6 py-5 bg-[#f8fafc] border-2 border-transparent rounded-[1.5rem] focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5 outline-none transition-all text-sm font-black text-slate-900 placeholder-slate-400 shadow-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="max-h-[55vh] overflow-y-auto pr-2 pos-scrollbar">
                    {loading ? (
                        <div className="py-24 flex flex-col items-center gap-5 text-slate-300">
                            <div className="w-12 h-12 border-[6px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                            <span className="font-black text-[10px] uppercase tracking-[0.3em]">Querying Database...</span>
                        </div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="py-24 text-center text-slate-400 animate-fade-in">
                            <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                                {React.cloneElement(ICONS.user as React.ReactElement, { size: 32, className: "opacity-20" })}
                            </div>
                            <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">No Records Found</h4>
                            <p className="text-[11px] font-bold mt-2 opacity-60">Refine your search parameters and try again.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredContacts.map(contact => {
                                const loyaltyMember = members.find(m => m.customerId === contact.id || m.phone === contact.contactNo);
                                return (
                                    <button
                                        key={contact.id}
                                        onClick={() => handleSelect(contact)}
                                        className="flex items-center gap-5 p-5 bg-white border border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-none hover:shadow-none-500/5 transition-all text-left group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/[0.02] rounded-full translate-x-10 -translate-y-10 group-hover:scale-150 transition-transform"></div>
                                        <div className="w-14 h-14 rounded-2xl bg-[#f8fafc] flex items-center justify-center text-slate-400 font-black text-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-none">
                                            {contact.name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0 relative z-10">
                                            <div className="font-black text-slate-900 truncate tracking-tight text-base mb-1">{contact.name}</div>
                                            <div className="text-[11px] text-slate-500 font-bold tracking-tight">{contact.contactNo || 'Anonymous Phone'}</div>
                                            {loyaltyMember && (
                                                <div className="mt-3 flex items-center gap-2">
                                                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                                                        {loyaltyMember.tier}
                                                    </span>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                                        {loyaltyMember.pointsBalance} <span className="opacity-60">POINTS</span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-slate-200 group-hover:translate-x-1 transition-transform group-hover:text-indigo-400">
                                            {ICONS.chevronRight}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-between items-center bg-[#f8fafc]/50 -mx-8 px-8 -mb-8 pb-8 rounded-b-[2rem]">
                    <button className="text-[11px] font-black uppercase tracking-widest text-white bg-indigo-600 px-6 py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-none shadow-none-200 flex items-center gap-3 active:scale-95">
                        {ICONS.plus} Register New Account
                    </button>
                    <button
                        onClick={() => {
                            setCustomer({
                                id: 'walk-in',
                                name: 'Walk-in Customer',
                                phone: '',
                                points: 0,
                                creditLimit: 0,
                                balance: 0,
                                tier: 'Standard'
                            });
                            onClose();
                        }}
                        className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 transition-colors uppercase"
                    >
                        Skip Selection
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CustomerSelectionModal;

