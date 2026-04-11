
import React, { useState } from 'react';
import { LoyaltyProvider, useLoyalty } from '../../context/LoyaltyContext';
import LoyaltyDashboard from './loyalty/LoyaltyDashboard';
import MemberDirectory from './loyalty/MemberDirectory';
import TierMatrix from './loyalty/TierMatrix';
import CampaignManager from './loyalty/CampaignManager';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { parsePakistanMobile } from '../../utils/pakistanMobile';
import type { ApiError } from '../../services/apiClient';

const LoyaltyContent: React.FC = () => {
    const { addMember } = useLoyalty();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'tiers' | 'campaigns'>('dashboard');
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [newMemberData, setNewMemberData] = useState({
        customerName: '',
        cardNumber: '',
        email: '',
        phone: ''
    });
    const [phoneError, setPhoneError] = useState('');
    const [enrollError, setEnrollError] = useState('');

    const handleEnroll = async () => {
        setEnrollError('');
        const parsed = parsePakistanMobile(newMemberData.phone);
        if (!parsed.ok) {
            setPhoneError(parsed.message);
            return;
        }
        setPhoneError('');
        try {
            await addMember({
                customerId: newMemberData.cardNumber || `CUST-${Date.now().toString().slice(-6)}`,
                customerName: newMemberData.customerName,
                cardNumber: newMemberData.cardNumber || `LOY-${Date.now().toString().slice(-6)}`,
                email: newMemberData.email,
                phone: parsed.digits,
                tier: 'Silver',
                visitCount: 0,
                totalSpend: 0,
                status: 'Active'
            });
            setIsEnrollModalOpen(false);
            setNewMemberData({ customerName: '', cardNumber: '', email: '', phone: '' });
        } catch (e) {
            const err = e as ApiError;
            const msg = typeof err?.error === 'string' ? err.error : 'Could not enroll member.';
            if (/Invalid phone|Phone number is required/i.test(msg)) {
                setPhoneError(msg.replace(/^Invalid phone:\s*/i, '').trim());
            } else {
                setEnrollError(msg);
            }
        }
    };

    const tabs = [
        { id: 'dashboard', label: 'Retention Hub', icon: ICONS.barChart },
        { id: 'members', label: 'Member Directory', icon: ICONS.users },
        { id: 'tiers', label: 'Tier & Rules', icon: ICONS.trophy },
        { id: 'campaigns', label: 'Campaigns', icon: ICONS.target },
    ];

    return (
        <div className="flex w-full min-w-0 flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800">
            {/* Header / Tab Navigation */}
            <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-8 pt-6 shadow-sm z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-foreground dark:text-slate-200 tracking-tight">Customer Retention Engine</h1>
                        <p className="text-muted-foreground dark:text-muted-foreground text-sm font-medium">Enterprise Loyalty & Reward Lifecycle Management.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                setPhoneError('');
                                setEnrollError('');
                                setIsEnrollModalOpen(true);
                            }}
                            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-100 dark:shadow-rose-900/40 hover:bg-rose-700 transition-all flex items-center gap-2"
                        >
                            {ICONS.plus} Enroll Member
                        </button>
                    </div>
                </div>

                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-300'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-600 dark:bg-rose-400 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-8">
                {activeTab === 'dashboard' && <LoyaltyDashboard />}
                {activeTab === 'members' && <MemberDirectory />}
                {activeTab === 'tiers' && <TierMatrix />}
                {activeTab === 'campaigns' && <CampaignManager />}
            </div>

            <Modal
                isOpen={isEnrollModalOpen}
                onClose={() => {
                    setPhoneError('');
                    setEnrollError('');
                    setIsEnrollModalOpen(false);
                }}
                title="Enroll New Loyalty Member"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Customer Name"
                            placeholder="Full Name"
                            value={newMemberData.customerName}
                            onChange={(e) => setNewMemberData({ ...newMemberData, customerName: e.target.value })}
                        />
                        <Input
                            label="Card / Member ID"
                            placeholder="Auto-generated if empty"
                            value={newMemberData.cardNumber}
                            onChange={(e) => setNewMemberData({ ...newMemberData, cardNumber: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Email Address"
                            type="email"
                            placeholder="customer@example.com"
                            value={newMemberData.email}
                            onChange={(e) => setNewMemberData({ ...newMemberData, email: e.target.value })}
                        />
                        <Input
                            label="Phone Number"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            placeholder="923*********"
                            helperText="Format: 92 followed by 10 digits (e.g. 923*********). Local 03… numbers are saved without the leading 0."
                            error={phoneError}
                            value={newMemberData.phone}
                            onChange={(e) => {
                                setPhoneError('');
                                setEnrollError('');
                                setNewMemberData({ ...newMemberData, phone: e.target.value });
                            }}
                            onBlur={() => {
                                const parsed = parsePakistanMobile(newMemberData.phone);
                                if (parsed.ok) {
                                    setNewMemberData((prev) => ({ ...prev, phone: parsed.digits }));
                                }
                            }}
                        />
                    </div>

                    {enrollError ? (
                        <p className="text-sm font-medium text-destructive" role="alert">
                            {enrollError}
                        </p>
                    ) : null}

                    <div className="bg-rose-50 dark:bg-rose-950/40 p-4 rounded-xl border border-rose-100 dark:border-rose-900/60 mt-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 rounded-lg">
                                {ICONS.trophy}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-rose-900 dark:text-rose-200">Sign-up Bonus</p>
                                <p className="text-xs text-rose-700 dark:text-rose-300/90">New members automatically receive 50 bonus points upon enrollment.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setPhoneError('');
                                setEnrollError('');
                                setIsEnrollModalOpen(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleEnroll()}
                            disabled={!newMemberData.customerName.trim()}
                        >
                            Enroll Member
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const LoyaltyPage: React.FC = () => {
    return (
        <LoyaltyProvider>
            <LoyaltyContent />
        </LoyaltyProvider>
    );
};

export default LoyaltyPage;
