
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoyaltyProvider, useLoyalty } from '../../context/LoyaltyContext';
import LoyaltyDashboard from './loyalty/LoyaltyDashboard';
import MemberDirectory from './loyalty/MemberDirectory';
import TierMatrix from './loyalty/TierMatrix';
import CampaignManager from './loyalty/CampaignManager';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { parsePakistanMobile, PHONE_HELPER_TEXT } from '../../utils/pakistanMobile';
import type { ApiError } from '../../services/apiClient';

const LoyaltyContent: React.FC = () => {
    const loyalty = useLoyalty();
    const {
        addMember,
        members,
        campaigns,
        tiers,
        transactions,
        programs,
        totalMembers,
        activeMembers,
        pointsIssued,
        pointsRedeemed,
        totalPointsOutstanding
    } = loyalty;
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'tiers' | 'campaigns'>(() => {
        if (typeof window === 'undefined') return 'dashboard';
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('member')) return 'members';
        const t = sp.get('tab');
        if (t === 'members' || t === 'tiers' || t === 'campaigns') return t;
        if (t === 'dashboard') return 'dashboard';
        return 'dashboard';
    });

    useEffect(() => {
        const member = searchParams.get('member');
        const tab = searchParams.get('tab');
        if (member) setActiveTab('members');
        else if (tab === 'members' || tab === 'tiers' || tab === 'campaigns') setActiveTab(tab);
        else if (tab === 'dashboard') setActiveTab('dashboard');
    }, [searchParams]);

    const setTab = useCallback(
        (id: 'dashboard' | 'members' | 'tiers' | 'campaigns') => {
            setActiveTab(id);
            const next = new URLSearchParams(searchParams);
            if (id !== 'members') next.delete('member');
            next.set('tab', id);
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams]
    );

    const handleExportGlobalData = useCallback(() => {
        const payload = {
            exportedAt: new Date().toISOString(),
            summary: {
                totalMembers,
                activeMembers,
                pointsIssued,
                pointsRedeemed,
                totalPointsOutstanding
            },
            programs,
            tiers,
            campaigns,
            transactions,
            members: members.map((m) => ({
                id: m.id,
                customerId: m.customerId,
                customerName: m.customerName,
                tier: m.tier,
                status: m.status,
                pointsBalance: m.pointsBalance,
                lifetimePoints: m.lifetimePoints,
                totalSpend: m.totalSpend,
                visitCount: m.visitCount,
                joinDate: m.joinDate,
                phone: m.phone,
                email: m.email
            }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `loyalty-global-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [
        members,
        campaigns,
        tiers,
        transactions,
        programs,
        totalMembers,
        activeMembers,
        pointsIssued,
        pointsRedeemed,
        totalPointsOutstanding
    ]);
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

    const tabs: { id: 'dashboard' | 'members' | 'tiers' | 'campaigns'; label: string }[] = [
        { id: 'dashboard', label: 'Retention Hub' },
        { id: 'members', label: 'Member Directory' },
        { id: 'tiers', label: 'Tier & Rules' },
        { id: 'campaigns', label: 'Campaigns' }
    ];

    const openEnroll = () => {
        setPhoneError('');
        setEnrollError('');
        setIsEnrollModalOpen(true);
    };

    return (
        <div className="flex w-full min-w-0 flex-col h-full min-h-0 flex-1 bg-[#F8F9FC] dark:bg-slate-900">
            {/* Header / Tab Navigation */}
            <div className="bg-[#F8F9FC] dark:bg-slate-900 px-8 pt-8 pb-0 z-10 border-b border-slate-200/80 dark:border-slate-700">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between mb-8">
                    <div>
                        <h1 className="text-[1.65rem] font-bold tracking-tight text-[#1a1d2e] dark:text-slate-100">
                            Customer Retention Engine
                        </h1>
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                            Enterprise Loyalty &amp; Reward Lifecycle Management
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => void handleExportGlobalData()}
                            className="inline-flex items-center gap-2 rounded-full bg-[#E1ECFF] dark:bg-indigo-950/60 px-5 py-2.5 text-sm font-semibold text-[#4B49D3] dark:text-indigo-300 shadow-sm hover:bg-[#d4e2fc] dark:hover:bg-indigo-900/50 transition-colors"
                        >
                            {React.cloneElement(ICONS.export as React.ReactElement<any>, { width: 18, height: 18 })}
                            Export Global Data
                        </button>
                        <button
                            type="button"
                            onClick={openEnroll}
                            className="inline-flex items-center gap-2 rounded-full bg-[#4B49D3] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-300/40 dark:shadow-indigo-950/50 hover:bg-[#3d3bb8] transition-colors"
                        >
                            {React.cloneElement(ICONS.plus as React.ReactElement<any>, { width: 18, height: 18 })}
                            Enroll Member
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1 rounded-full bg-slate-200/60 dark:bg-slate-800/80 p-1.5 w-fit max-w-full">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setTab(tab.id)}
                            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                                activeTab === tab.id
                                    ? 'bg-white dark:bg-slate-700 text-[#4B49D3] dark:text-indigo-300 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-[#4B49D3] dark:hover:text-indigo-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="h-6" aria-hidden />
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-8">
                {activeTab === 'dashboard' && (
                    <LoyaltyDashboard onNavigateMembers={() => setTab('members')} />
                )}
                {activeTab === 'members' && (
                    <MemberDirectory
                        onEnrollClick={() => {
                            setPhoneError('');
                            setEnrollError('');
                            setIsEnrollModalOpen(true);
                        }}
                    />
                )}
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
                            placeholder="0300 1234567"
                            helperText={PHONE_HELPER_TEXT}
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
