import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Smartphone, Printer, Truck, MapPin, ShieldCheck, Search, ChevronLeft, ChevronRight, ChevronDown, Upload, Bike } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { shopApi, accountingApi, ShopBankAccount, ShopRider, RiderActivityRow } from '../../services/shopApi';
import Card from '../ui/Card';
import { AccountingProvider } from '../../context/AccountingContext';
import ChartOfAccounts from './accounting/ChartOfAccounts';
import { MobileSettingsPanel } from './MobileOrdersPage';
import DataExportImportSection from './settings/DataExportImportSection';
import BackupRestoreSection from './settings/BackupRestoreSection';
import { BranchConfigurationSection } from './settings/BranchConfigurationSection';
import { useSettingsEditLock } from '../../hooks/useSettingsEditLock';
import { getFullImageUrl } from '../../config/apiUrl';

import { generateReceiptHTML, ReceiptSaleData, RECEIPT_PRINT_FONT_OPTIONS } from '../../services/receipt/receiptBuilder';
import QRCode from 'qrcode';

/** Stable hash so iframe `key` changes whenever preview HTML changes (forces remount; some browsers ignore `srcDoc` updates). */
function previewContentKey(html: string): string {
    let h = 2166136261;
    for (let i = 0; i < html.length; i++) {
        h ^= html.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `${html.length}:${h >>> 0}`;
}

const ReceiptPreviewPanel: React.FC<{ receiptSettings: any; logoUrlOverride?: string | null }> = ({
    receiptSettings,
    logoUrlOverride
}) => {
    const [mobileQrDataUrl, setMobileQrDataUrl] = useState<string | null>(null);
    useEffect(() => {
        if (receiptSettings?.show_mobile_url_qr && receiptSettings?.mobile_order_url) {
            QRCode.toDataURL(receiptSettings.mobile_order_url, { width: 200, margin: 1 })
                .then(setMobileQrDataUrl)
                .catch(() => setMobileQrDataUrl(null));
        } else {
            setMobileQrDataUrl(null);
        }
    }, [receiptSettings?.show_mobile_url_qr, receiptSettings?.mobile_order_url]);

    const { previewHtml, iframeKey, containerWidth } = useMemo(() => {
        const saleData: ReceiptSaleData = {
            storeName: receiptSettings.shop_name || 'My Store',
            storeAddress: receiptSettings.shop_address || '123 Fake Street',
            storePhone: receiptSettings.shop_phone || '021-1234567',
            taxId: receiptSettings.tax_id || '',
            logoUrl:
                logoUrlOverride ??
                getFullImageUrl(receiptSettings.logo_url?.trim()) ??
                receiptSettings.logo_url ??
                null,
            receiptNumber: 'SALE-TEST-001',
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            cashier: 'John Cashier',
            shiftNumber: '1',
            customer: 'Walk-in Customer',
            items: [
                { name: 'Test Product 1', quantity: 1, unitPrice: 25.00, total: 25.00 },
                { name: 'Test Product 2', quantity: 2, unitPrice: 15.00, total: 30.00 }
            ],
            subtotal: 55.00,
            discount: 5.00,
            tax: 5.00,
            total: 55.00,
            payments: [{ method: 'Cash', amount: 55.00 }],
            change: 0,
            barcode_value: 'SALE-TEST-001'
        };

        const settingsWithQr = mobileQrDataUrl
            ? { ...receiptSettings, mobile_qr_data_url: mobileQrDataUrl }
            : receiptSettings;
        const html = generateReceiptHTML(saleData, settingsWithQr);
        const width = receiptSettings.receipt_width === '58mm' ? '58mm' : '80mm';
        return {
            previewHtml: html,
            iframeKey: previewContentKey(html),
            containerWidth: width
        };
    }, [receiptSettings, mobileQrDataUrl, logoUrlOverride]);

    return (
        <Card id="pos-receipt-live-preview" className="border-none shadow-sm p-6 bg-muted flex flex-col items-center overflow-hidden">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 self-start">Live Preview</h3>
            <div className="bg-card shadow-xl border border-border transition-all overflow-hidden relative" style={{ width: containerWidth }}>
                <iframe
                    key={iframeKey}
                    srcDoc={previewHtml}
                    style={{ width: '100%', height: '500px', border: 'none', backgroundColor: '#fff' }}
                    title="Receipt Preview"
                />
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">This is an approximate software rendering.<br />Actual thermal paper may look slightly different.</p>
        </Card>
    );
};

const USER_PAGE_SIZE = 10;

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
    'bg-indigo-100 text-indigo-600',
    'bg-emerald-100 text-emerald-600',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-600',
    'bg-cyan-100 text-cyan-700',
    'bg-violet-100 text-violet-600',
    'bg-pink-100 text-pink-600',
    'bg-teal-100 text-teal-700',
];

function getAvatarColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const ROLE_BADGE: Record<string, string> = {
    admin: 'bg-indigo-600 text-white',
    accountant: 'bg-amber-500 text-white',
    pos_cashier: 'bg-emerald-500 text-white',
};

function roleBadgeClasses(role: string) {
    return ROLE_BADGE[role] || 'bg-muted text-foreground';
}

function roleLabel(role: string) {
    if (role === 'admin') return 'ADMIN';
    if (role === 'accountant') return 'ACCOUNTANT';
    if (role === 'pos_cashier') return 'CASHER';
    return role.replace(/_/g, ' ').toUpperCase();
}

interface UserManagementTabProps {
    users: any[];
    usersLoading: boolean;
    riders: ShopRider[];
    ridersLoading: boolean;
    openNewUser: () => void;
    openEditUser: (u: any) => void;
    handleDeactivateUser: (id: string) => void;
    openNewRider: () => void;
    setRiderPasswordTarget: (r: ShopRider) => void;
    setRiderPasswordValue: (v: string) => void;
    handleToggleRiderActive: (rider: ShopRider) => void;
    handleViewRiderActivity: (rider: ShopRider) => void;
}

const UserManagementTab: React.FC<UserManagementTabProps> = ({
    users,
    usersLoading,
    riders,
    ridersLoading,
    openNewUser,
    openEditUser,
    handleDeactivateUser,
    openNewRider,
    setRiderPasswordTarget,
    setRiderPasswordValue,
    handleToggleRiderActive,
    handleViewRiderActivity,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);
    const cashierCount = useMemo(() => users.filter(u => u.role === 'pos_cashier').length, [users]);
    const staffCount = useMemo(() => users.filter(u => u.role === 'accountant').length, [users]);

    const filteredUsers = useMemo(() => {
        let result = [...users];
        if (roleFilter !== 'all') result = result.filter(u => u.role === roleFilter);
        if (statusFilter === 'active') result = result.filter(u => u.is_active);
        else if (statusFilter === 'inactive') result = result.filter(u => !u.is_active);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(u =>
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.username && u.username.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q))
            );
        }
        return result;
    }, [users, searchQuery, roleFilter, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const pagedUsers = filteredUsers.slice((safePage - 1) * USER_PAGE_SIZE, safePage * USER_PAGE_SIZE);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, roleFilter, statusFilter]);

    const allPageSelected = pagedUsers.length > 0 && pagedUsers.every(u => selectedIds.has(u.id));
    const toggleSelectAll = () => {
        if (allPageSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                pagedUsers.forEach(u => next.delete(u.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                pagedUsers.forEach(u => next.add(u.id));
                return next;
            });
        }
    };
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-foreground tracking-tight">User Management</h2>
                    <p className="text-muted-foreground text-sm mt-1">Manage POS team members (Admin, Accountant, POS Cashier)</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="text-center px-4 py-2 rounded-lg bg-card border border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Users</div>
                            <div className="text-xl font-bold text-foreground">{users.length}</div>
                        </div>
                        <div className="text-center px-4 py-2 rounded-lg bg-card border border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Admins</div>
                            <div className="text-xl font-bold text-foreground">{adminCount}</div>
                        </div>
                        <div className="text-center px-4 py-2 rounded-lg bg-card border border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cashiers</div>
                            <div className="text-xl font-bold text-foreground">{cashierCount}</div>
                        </div>
                        <div className="text-center px-4 py-2 rounded-lg bg-card border border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Staff</div>
                            <div className="text-xl font-bold text-foreground">{staffCount}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search & Filters */}
            <Card className="border-none shadow-sm p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search team members..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="input w-full pl-10 pr-3 py-2 text-sm"
                        />
                    </div>
                    <div className="relative">
                        <select
                            value={roleFilter}
                            onChange={e => setRoleFilter(e.target.value)}
                            className="input text-sm py-2 pl-3 pr-8 rounded-lg appearance-none"
                            aria-label="Filter by role"
                        >
                            <option value="all">All Roles</option>
                            <option value="admin">Admin</option>
                            <option value="accountant">Accountant</option>
                            <option value="pos_cashier">POS Cashier</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <div className="relative">
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="input text-sm py-2 pl-3 pr-8 rounded-lg appearance-none"
                            aria-label="Filter by status"
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            type="button"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Import Users
                        </button>
                        <Button onClick={openNewUser} className="flex items-center gap-2">
                            {ICONS.plus} + New User
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Users Table */}
            <Card className="border-none shadow-sm overflow-hidden">
                {usersLoading ? (
                    <div className="p-12 text-center text-muted-foreground">Loading users...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-muted/60 text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 w-10">
                                        <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="rounded border-border" title="Select all" />
                                    </th>
                                    <th className="px-4 py-3">Name / Username</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3">Email</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {pagedUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                            {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                                                ? 'No users match your filters.'
                                                : 'No users found.'}
                                        </td>
                                    </tr>
                                ) : (
                                    pagedUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-4 py-4 w-10">
                                                <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} className="rounded border-border" title={`Select ${u.name}`} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(u.id)}`}>
                                                        {getInitials(u.name || u.username)}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-foreground">{u.name}</div>
                                                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md ${roleBadgeClasses(u.role)}`}>
                                                    {roleLabel(u.role)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-sm text-muted-foreground">{u.email || '—'}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                                                    <span className={`text-sm ${u.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                        {u.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => openEditUser(u)} className="p-1.5 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Edit">
                                                        {React.cloneElement(ICONS.edit as React.ReactElement<{ width?: number; height?: number }>, { width: 16, height: 16 })}
                                                    </button>
                                                    {u.is_active && u.role !== 'admin' && (
                                                        <button onClick={() => handleDeactivateUser(u.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors" title="Deactivate">
                                                            {React.cloneElement(ICONS.trash as React.ReactElement<{ width?: number; height?: number }>, { width: 16, height: 16 })}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {!usersLoading && filteredUsers.length > USER_PAGE_SIZE && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-border text-sm">
                        <span className="text-muted-foreground text-xs">
                            Showing {(safePage - 1) * USER_PAGE_SIZE + 1} to {Math.min(safePage * USER_PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted border border-border disabled:opacity-30 transition-colors"
                            >
                                Previous
                            </button>
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                let pageNum: number;
                                if (totalPages <= 5) pageNum = i + 1;
                                else if (safePage <= 3) pageNum = i + 1;
                                else if (safePage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                else pageNum = safePage - 2 + i;
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`min-w-[32px] h-8 rounded-md text-xs font-semibold transition-colors ${
                                            safePage === pageNum
                                                ? 'bg-primary-600 text-white'
                                                : 'text-muted-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted border border-border disabled:opacity-30 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Rider info callout */}
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-blue-600 text-xs font-bold">i</span>
                </div>
                <p>
                    <span className="font-semibold text-foreground">Delivery riders</span> use a separate rider web app. To log in, they require your shop slug, their registered phone number, and their personal password.
                </p>
            </div>

            {/* Delivery Riders Header */}
            <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2">
                    <Bike className="w-5 h-5 text-foreground" />
                    <h3 className="text-xl font-bold text-foreground">Delivery Riders</h3>
                </div>
                <Button onClick={openNewRider} className="flex items-center gap-2">
                    {ICONS.plus} + New Rider
                </Button>
            </div>

            {/* Riders Table */}
            <Card className="border-none shadow-sm overflow-hidden">
                {ridersLoading ? (
                    <div className="p-12 text-center text-muted-foreground">Loading riders...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-muted/60 text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
                                <tr>
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3">Phone</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3">App Status</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {riders.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                            No delivery riders yet. Create one so they can sign in to the rider app.
                                        </td>
                                    </tr>
                                ) : (
                                    riders.map((r) => (
                                        <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-6 py-4 font-semibold text-foreground">{r.name}</td>
                                            <td className="px-6 py-4 text-sm text-muted-foreground">{r.phone_number}</td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md ${
                                                    r.status === 'AVAILABLE'
                                                        ? 'bg-emerald-500 text-white'
                                                        : r.status === 'BUSY'
                                                          ? 'bg-amber-500 text-white'
                                                          : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                                                    <span className={`text-sm ${r.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                        {r.is_active ? 'Active' : 'Disabled'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRiderPasswordTarget(r);
                                                            setRiderPasswordValue('');
                                                        }}
                                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                                                    >
                                                        Set Password
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleRiderActive(r)}
                                                        className={`text-xs font-semibold transition-colors ${r.is_active ? 'text-muted-foreground hover:text-rose-500' : 'text-emerald-600 hover:text-emerald-800'}`}
                                                    >
                                                        {r.is_active ? 'Disable' : 'Enable'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleViewRiderActivity(r)}
                                                        className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        View Activity
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};

const SettingsContent: React.FC = () => {
    const { user } = useAuth();
    const settingsLock = useSettingsEditLock(user?.userId, user?.name || user?.username || 'User');
    const isCashier = user?.role === 'pos_cashier';
    const [activeTab, setActiveTab] = useState<'coa' | 'users' | 'mobileBranding' | 'branchConfig' | 'pos' | 'app' | 'data'>(isCashier ? 'app' : 'coa');

    const [posSettings, setPosSettings] = useState({
        auto_print_receipt: true,
        default_printer_name: '',
        receipt_copies: 1,
        auto_logout_minutes: 0
    });
    const [posSettingsLoading, setPosSettingsLoading] = useState(false);
    const [receiptSettings, setReceiptSettings] = useState<any>({
        show_logo: false,
        show_barcode: true,
        barcode_type: 'CODE128',
        barcode_position: 'footer',
        barcode_size: 'medium',
        receipt_width: '80mm',
        show_tax_breakdown: false,
        show_cashier_name: true,
        show_shift_number: true,
        footer_message: '',
        show_mobile_url_qr: false,
        shop_name: '',
        shop_address: '',
        shop_phone: '',
        tax_id: '',
        logo_url: '',
        margin_top_mm: 2,
        margin_bottom_mm: 2,
        margin_left_mm: 2,
        margin_right_mm: 4,
        print_font_family: 'roboto_mono',
        print_font_size: 12,
        print_font_weight: 'normal',
        print_line_spacing: 1.2
    });
    const [receiptSettingsLoading, setReceiptSettingsLoading] = useState(false);
    const receiptLogoFileInputRef = useRef<HTMLInputElement>(null);
    const [receiptLogoBlobUrl, setReceiptLogoBlobUrl] = useState<string | null>(null);
    const [receiptLogoUploading, setReceiptLogoUploading] = useState(false);

    useEffect(() => {
        return () => {
            if (receiptLogoBlobUrl) URL.revokeObjectURL(receiptLogoBlobUrl);
        };
    }, [receiptLogoBlobUrl]);

    const [users, setUsers] = useState<any[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [userForm, setUserForm] = useState({
        username: '', name: '', email: '', password: '', role: 'pos_cashier'
    });

    const [riders, setRiders] = useState<ShopRider[]>([]);
    const [ridersLoading, setRidersLoading] = useState(true);
    const [isRiderCreateModalOpen, setIsRiderCreateModalOpen] = useState(false);
    const [riderCreateForm, setRiderCreateForm] = useState({ name: '', phone: '', password: '' });
    const [riderPasswordTarget, setRiderPasswordTarget] = useState<ShopRider | null>(null);
    const [riderPasswordValue, setRiderPasswordValue] = useState('');

    const [appVersion, setAppVersion] = useState<string | null>(null);
    const [updateStatus, setUpdateStatus] = useState<{ status: string; message?: string; version?: string; percent?: number } | null>(null);
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

    const [clearTransactionsConfirm, setClearTransactionsConfirm] = useState(false);
    const [clearingTransactions, setClearingTransactions] = useState(false);

    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;
        window.electronAPI?.getAppVersion?.().then(setAppVersion);
    }, [isElectron]);

    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;
        const unsub = window.electronAPI.onUpdateStatus?.((payload) => setUpdateStatus(payload));
        return () => { unsub?.(); };
    }, [isElectron]);

    const handleCheckForUpdates = useCallback(() => {
        if (!window.electronAPI) return;
        setUpdateStatus({ status: 'checking' });
        window.electronAPI?.checkForUpdates?.();
    }, []);

    const handleDownloadUpdate = useCallback(() => {
        if (!window.electronAPI) return;
        window.electronAPI?.startUpdateDownload?.();
    }, []);

    const handleQuitAndInstall = useCallback(() => {
        if (!window.electronAPI) return;
        window.electronAPI?.quitAndInstall?.();
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            const { shopUserApi } = await import('../../services/shopApi');
            setUsersLoading(true);
            const list = await shopUserApi.getUsers();
            setUsers(Array.isArray(list) ? list : []);
        } catch {
            setUsers([]);
        } finally {
            setUsersLoading(false);
        }
    }, []);

    const loadRiders = useCallback(async () => {
        try {
            const { shopRiderApi } = await import('../../services/shopApi');
            setRidersLoading(true);
            const list = await shopRiderApi.getRiders();
            setRiders(Array.isArray(list) ? list : []);
        } catch {
            setRiders([]);
        } finally {
            setRidersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isCashier) setActiveTab('app');
    }, [isCashier]);

    const loadPosSettings = useCallback(async () => {
        try {
            setPosSettingsLoading(true);
            const data = await shopApi.getPosSettings();
            if (data) setPosSettings(prev => ({ ...prev, ...data, auto_logout_minutes: data.auto_logout_minutes ?? prev.auto_logout_minutes }));
        } catch (e: any) {
            console.error('Failed to load POS settings', e);
        } finally {
            setPosSettingsLoading(false);
        }
    }, []);

    const loadReceiptSettings = useCallback(async () => {
        try {
            setReceiptSettingsLoading(true);
            const data = await shopApi.getReceiptSettings();
            if (data) {
                setReceiptSettings((prev) => ({
                    ...prev,
                    ...data,
                    print_font_family: data.print_font_family ?? 'roboto_mono',
                    print_font_size: data.print_font_size != null ? Number(data.print_font_size) : 12,
                    print_font_weight: data.print_font_weight ?? 'normal',
                    print_line_spacing: data.print_line_spacing != null ? Number(data.print_line_spacing) : 1.2
                }));
            }
        } catch (e: any) {
            console.error('Failed to load receipt settings', e);
        } finally {
            setReceiptSettingsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'pos') {
            loadPosSettings();
            loadReceiptSettings();
        }
        if (activeTab === 'users') {
            loadUsers();
            loadRiders();
        }
    }, [activeTab, loadUsers, loadRiders, loadPosSettings, loadReceiptSettings]);

    const handleSavePosSettings = async () => {
        try {
            const result = await shopApi.updatePosSettings(posSettings);
            setPosSettings(result);
            alert('POS settings saved successfully');
        } catch (e: any) {
            const msg = e?.message || e?.error || 'Failed to save POS settings';
            alert(msg);
            loadPosSettings();
        }
    };

    const handleSaveReceiptSettings = async () => {
        try {
            const result = await shopApi.updateReceiptSettings(receiptSettings);
            setReceiptSettings(result);
            alert('Receipt template settings saved');
        } catch (e: any) {
            const msg = e?.message || e?.error || 'Failed to save receipt settings';
            alert(msg);
            loadReceiptSettings();
        }
    };

    const handleReceiptLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please choose an image file (PNG, JPEG, WebP, or GIF).');
            e.target.value = '';
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setReceiptLogoBlobUrl(objectUrl);
        try {
            setReceiptLogoUploading(true);
            const res = await shopApi.uploadImage(file);
            const payload = { ...receiptSettings, logo_url: res.imageUrl, show_logo: true };
            const saved = await shopApi.updateReceiptSettings(payload);
            setReceiptSettings(saved);
            setReceiptLogoBlobUrl(null);
        } catch (err) {
            console.error(err);
            alert('Failed to upload or save logo. Try a smaller file or click Save receipt template after choosing a file.');
            setReceiptLogoBlobUrl(null);
        } finally {
            setReceiptLogoUploading(false);
            e.target.value = '';
        }
    }, [receiptSettings]);

    const openNewUser = () => {
        setEditingUser(null);
        setUserForm({ username: '', name: '', email: '', password: '', role: 'pos_cashier' });
        setIsUserModalOpen(true);
    };

    const openEditUser = (u: any) => {
        setEditingUser(u);
        setUserForm({
            username: u.username,
            name: u.name,
            email: u.email || '',
            password: '',
            role: u.role
        });
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!userForm.username || !userForm.name || (!editingUser && !userForm.password)) {
            alert('Please fill in all required fields');
            return;
        }
        try {
            const { shopUserApi } = await import('../../services/shopApi');
            if (editingUser) {
                await shopUserApi.updateUser(editingUser.id, userForm);
            } else {
                await shopUserApi.createUser(userForm);
            }
            setIsUserModalOpen(false);
            loadUsers();
        } catch (e: any) {
            alert(e?.message || 'Failed to save user');
        }
    };

    const handleDeactivateUser = async (id: string) => {
        if (!confirm('Deactivate this user? They will no longer be able to login.')) return;
        try {
            const { shopUserApi } = await import('../../services/shopApi');
            await shopUserApi.deleteUser(id);
            loadUsers();
        } catch (e: any) {
            alert(e?.message || 'Failed to deactivate');
        }
    };

    const openNewRider = () => {
        setRiderCreateForm({ name: '', phone: '', password: '' });
        setIsRiderCreateModalOpen(true);
    };

    const handleSaveRider = async () => {
        const { name, phone, password } = riderCreateForm;
        if (!name.trim() || !phone.trim() || !password) {
            alert('Name, phone, and password are required.');
            return;
        }
        try {
            const { shopRiderApi } = await import('../../services/shopApi');
            await shopRiderApi.createRider({
                name: name.trim(),
                phone: phone.trim(),
                password,
            });
            setIsRiderCreateModalOpen(false);
            setRiderCreateForm({ name: '', phone: '', password: '' });
            loadRiders();
        } catch (e: any) {
            alert(e?.message || e?.error || 'Failed to create rider');
        }
    };

    const handleSaveRiderPassword = async () => {
        if (!riderPasswordTarget || !riderPasswordValue) {
            alert('Enter a new password.');
            return;
        }
        try {
            const { shopRiderApi } = await import('../../services/shopApi');
            await shopRiderApi.setRiderPassword(riderPasswordTarget.id, riderPasswordValue);
            setRiderPasswordTarget(null);
            setRiderPasswordValue('');
            loadRiders();
        } catch (e: any) {
            alert(e?.message || e?.error || 'Failed to update password');
        }
    };

    const [riderActivityTarget, setRiderActivityTarget] = useState<ShopRider | null>(null);
    const [riderActivity, setRiderActivity] = useState<RiderActivityRow[]>([]);
    const [riderActivityLoading, setRiderActivityLoading] = useState(false);

    const handleToggleRiderActive = async (rider: ShopRider) => {
        const next = !rider.is_active;
        const action = next ? 'enable' : 'disable';
        if (!confirm(`Are you sure you want to ${action} rider "${rider.name}"?`)) return;
        try {
            const { shopRiderApi } = await import('../../services/shopApi');
            await shopRiderApi.setRiderActive(rider.id, next);
            loadRiders();
        } catch (e: any) {
            alert(e?.message || e?.error || `Failed to ${action} rider`);
        }
    };

    const handleViewRiderActivity = async (rider: ShopRider) => {
        setRiderActivityTarget(rider);
        setRiderActivityLoading(true);
        setRiderActivity([]);
        try {
            const { shopRiderApi } = await import('../../services/shopApi');
            const rows = await shopRiderApi.getRiderActivity(rider.id);
            setRiderActivity(Array.isArray(rows) ? rows : []);
        } catch (e: any) {
            alert(e?.message || e?.error || 'Failed to load rider activity');
        } finally {
            setRiderActivityLoading(false);
        }
    };

    const handleClearAllTransactions = async () => {
        setClearingTransactions(true);
        try {
            await accountingApi.clearAllTransactions();
            setClearTransactionsConfirm(false);
            alert('All transactions have been cleared. The app now has a fresh look.');
        } catch (e: any) {
            alert(e?.message || 'Failed to clear transactions');
        } finally {
            setClearingTransactions(false);
        }
    };

    const allTabs = [
        { id: 'coa' as const, label: 'Chart of Accounts', icon: ICONS.list },
        { id: 'users' as const, label: 'User Management', icon: ICONS.users },
        { id: 'mobileBranding' as const, label: 'Mobile branding', icon: <Smartphone /> },
        { id: 'branchConfig' as const, label: 'Branch configuration', icon: <MapPin /> },
        { id: 'pos' as const, label: 'POS Preferences', icon: <Printer /> },
        { id: 'data' as const, label: 'Data', icon: ICONS.trash },
        { id: 'app' as const, label: 'App', icon: ICONS.download },
    ];
    const tabs = isCashier ? allTabs.filter(t => t.id === 'app') : allTabs;

    const settingsLockedOut =
        settingsLock.mode === 'loading' ||
        settingsLock.mode === 'blocked' ||
        settingsLock.lostLock;

    return (
        <div className="relative flex w-full min-w-0 flex-col h-full bg-muted/80">
            <div className={settingsLockedOut ? 'pointer-events-none opacity-40 min-h-0 flex flex-col flex-1' : 'min-h-0 flex flex-col flex-1'}>
            <div className="bg-card border-b border-border px-8 pt-5 pb-4 shadow-sm z-10">
                <div className="flex items-center gap-2 flex-wrap">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-sm font-semibold rounded-full transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-foreground text-background shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={`flex-1 overflow-y-auto ${!isCashier && activeTab === 'mobileBranding' ? 'p-4 sm:p-6' : 'p-8'}`}>

                {!isCashier && activeTab === 'branchConfig' && (
                    <BranchConfigurationSection />
                )}

                {!isCashier && activeTab === 'coa' && (
                    <ChartOfAccounts />
                )}

                {!isCashier && activeTab === 'data' && (
                    <div className="w-full min-w-0 space-y-6">
                        <DataExportImportSection />
                        <BackupRestoreSection />
                        <Card className="border-none shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Clear all transactions</h3>
                            <p className="text-muted-foreground text-sm mb-4">
                                Remove all sales transactions, orders, journal entries, transaction history, purchase bills, and bill payments. Settings, chart of accounts, bank accounts, users, vendors, products, and inventories (stock levels and movement history) are kept.
                            </p>
                            <Button
                                variant="secondary"
                                onClick={() => setClearTransactionsConfirm(true)}
                                disabled={clearingTransactions}
                                className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                            >
                                {clearingTransactions ? 'Clearing…' : 'Clear all transactions'}
                            </Button>
                        </Card>
                    </div>
                )}

                {activeTab === 'app' && (
                    <div className="w-full min-w-0 space-y-6">
                        <Card className="border-none shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Desktop app</h3>
                            {appVersion != null && (
                                <p className="text-muted-foreground text-sm mb-4">Current version: <span className="font-bold text-foreground">{appVersion}</span></p>
                            )}
                            {isElectron ? (
                                <div className="space-y-3">
                                    <Button
                                        onClick={handleCheckForUpdates}
                                        disabled={updateStatus?.status === 'checking' || updateStatus?.status === 'downloading'}
                                        className="flex items-center gap-2"
                                    >
                                        {updateStatus?.status === 'checking' ? (
                                            <>Checking…</>
                                        ) : updateStatus?.status === 'downloading' ? (
                                            <>Downloading…</>
                                        ) : (
                                            <>Check for updates</>
                                        )}
                                    </Button>
                                    {updateStatus?.status === 'available' && updateStatus?.version && (
                                        <div className="flex items-center gap-3 pt-2">
                                            <p className="text-emerald-600 text-sm font-medium">New version {updateStatus.version} available.</p>
                                            <Button variant="secondary" onClick={handleDownloadUpdate}>Download and install</Button>
                                        </div>
                                    )}
                                    {updateStatus?.status === 'downloading' && (() => {
                                        const percent = updateStatus.percent != null ? Math.min(100, Math.max(0, updateStatus.percent)) : 0;
                                        return (
                                            <div className="space-y-2 pt-2">
                                                <p className="text-muted-foreground text-sm font-medium">Downloading update…</p>
                                                <progress
                                                    value={percent}
                                                    max={100}
                                                    className="h-2.5 w-full rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-emerald-500"
                                                    aria-label="Update download progress"
                                                />
                                                <p className="text-muted-foreground text-xs tabular-nums">{Math.round(percent)}%</p>
                                            </div>
                                        );
                                    })()}
                                    {updateStatus?.status === 'downloaded' && (
                                        <div className="flex items-center gap-3 pt-2">
                                            <p className="text-emerald-600 text-sm font-medium">Update ready. Restart the app to install.</p>
                                            <Button onClick={handleQuitAndInstall}>Restart to install</Button>
                                        </div>
                                    )}
                                    {updateStatus?.status === 'not-available' && (
                                        <p className="text-muted-foreground text-sm pt-2">You’re on the latest version.</p>
                                    )}
                                    {(updateStatus?.status === 'error' || updateStatus?.status === 'unavailable') && updateStatus?.message && (
                                        <p className="text-amber-600 text-sm pt-2">{updateStatus.message}</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm">Update check is available in the installed desktop app only.</p>
                            )}
                        </Card>
                    </div>
                )}

                {!isCashier && activeTab === 'users' && (
                    <UserManagementTab
                        users={users}
                        usersLoading={usersLoading}
                        riders={riders}
                        ridersLoading={ridersLoading}
                        openNewUser={openNewUser}
                        openEditUser={openEditUser}
                        handleDeactivateUser={handleDeactivateUser}
                        openNewRider={openNewRider}
                        setRiderPasswordTarget={setRiderPasswordTarget}
                        setRiderPasswordValue={setRiderPasswordValue}
                        handleToggleRiderActive={handleToggleRiderActive}
                        handleViewRiderActivity={handleViewRiderActivity}
                    />
                )}

                {!isCashier && activeTab === 'mobileBranding' && (
                    <MobileSettingsPanel />
                )}

                {activeTab === 'pos' && (
                    <div className="flex w-full min-w-0 flex-col xl:flex-row gap-6">
                        <div className="w-full min-w-0 flex-1 space-y-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Card className="border-none shadow-sm p-5">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Printer</h3>
                                    {posSettingsLoading ? (
                                        <p className="text-muted-foreground text-sm">Loading...</p>
                                    ) : (
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <div className="relative shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={posSettings.auto_print_receipt}
                                                        onChange={e => setPosSettings({ ...posSettings, auto_print_receipt: e.target.checked })}
                                                    />
                                                    <div className={`block w-10 h-6 rounded-full transition-colors ${posSettings.auto_print_receipt ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                                                    <div className={`dot absolute left-1 top-1 bg-card w-4 h-4 rounded-full transition-transform ${posSettings.auto_print_receipt ? 'transform translate-x-4' : ''}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-foreground">Auto-print after sale</p>
                                                    <p className="text-xs text-muted-foreground">Opens the print dialog when a sale completes.</p>
                                                </div>
                                            </label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <Input
                                                    label="Default printer (optional)"
                                                    placeholder="e.g. Black Copper"
                                                    compact
                                                    value={posSettings.default_printer_name || ''}
                                                    onChange={e => setPosSettings({ ...posSettings, default_printer_name: e.target.value })}
                                                />
                                                <Input
                                                    label="Copies"
                                                    type="number"
                                                    min={1}
                                                    max={5}
                                                    compact
                                                    value={String(posSettings.receipt_copies || 1)}
                                                    onChange={e => setPosSettings({ ...posSettings, receipt_copies: parseInt(e.target.value, 10) || 1 })}
                                                />
                                            </div>
                                            <Button type="button" size="sm" onClick={handleSavePosSettings}>Save printer settings</Button>
                                        </div>
                                    )}
                                </Card>
                                <Card className="border-none shadow-sm p-5">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4" /> Security
                                    </h3>
                                    {posSettingsLoading ? (
                                        <p className="text-muted-foreground text-sm">Loading...</p>
                                    ) : (
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <div className="relative shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={posSettings.auto_logout_minutes > 0}
                                                        onChange={e => setPosSettings({ ...posSettings, auto_logout_minutes: e.target.checked ? 15 : 0 })}
                                                    />
                                                    <div className={`block w-10 h-6 rounded-full transition-colors ${posSettings.auto_logout_minutes > 0 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                                                    <div className={`dot absolute left-1 top-1 bg-card w-4 h-4 rounded-full transition-transform ${posSettings.auto_logout_minutes > 0 ? 'transform translate-x-4' : ''}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-foreground">Auto-logout on inactivity</p>
                                                    <p className="text-xs text-muted-foreground">Automatically sign out after a period of no activity.</p>
                                                </div>
                                            </label>
                                            {posSettings.auto_logout_minutes > 0 && (
                                                <Input
                                                    label="Timeout (minutes)"
                                                    type="number"
                                                    min={1}
                                                    max={480}
                                                    compact
                                                    value={String(posSettings.auto_logout_minutes)}
                                                    onChange={e => {
                                                        const n = parseInt(e.target.value, 10);
                                                        setPosSettings({ ...posSettings, auto_logout_minutes: Number.isFinite(n) ? Math.min(480, Math.max(1, n)) : 15 });
                                                    }}
                                                />
                                            )}
                                            <Button type="button" size="sm" onClick={handleSavePosSettings}>Save POS settings</Button>
                                        </div>
                                    )}
                                </Card>
                                <Card className="border-none shadow-sm p-5">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paper &amp; margins</h3>
                                    <p className="text-xs text-muted-foreground mb-3">Margins are in millimeters. Increase the right margin if the last column is cut off on your thermal printer.</p>
                                    {receiptSettingsLoading ? (
                                        <p className="text-muted-foreground text-sm">Loading...</p>
                                    ) : (
                                        <div className="space-y-3">
                                            <div>
                                                <label htmlFor="pos-receipt-roll-width" className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Roll width</label>
                                                <select
                                                    id="pos-receipt-roll-width"
                                                    className="w-full h-10 px-3 bg-muted/80 border-2 border-border rounded-xl text-sm font-bold text-foreground"
                                                    value={receiptSettings.receipt_width || '80mm'}
                                                    onChange={e => setReceiptSettings({ ...receiptSettings, receipt_width: e.target.value })}
                                                >
                                                    <option value="80mm">80mm</option>
                                                    <option value="58mm">58mm</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                <Input
                                                    label="Top"
                                                    type="number"
                                                    min={0}
                                                    max={25}
                                                    step={0.5}
                                                    compact
                                                    helperText="mm"
                                                    value={String(receiptSettings.margin_top_mm ?? 2)}
                                                    onChange={e => {
                                                        const n = parseFloat(e.target.value);
                                                        setReceiptSettings({ ...receiptSettings, margin_top_mm: Number.isFinite(n) ? n : 2 });
                                                    }}
                                                />
                                                <Input
                                                    label="Right"
                                                    type="number"
                                                    min={0}
                                                    max={25}
                                                    step={0.5}
                                                    compact
                                                    helperText="mm"
                                                    value={String(receiptSettings.margin_right_mm ?? 4)}
                                                    onChange={e => {
                                                        const n = parseFloat(e.target.value);
                                                        setReceiptSettings({ ...receiptSettings, margin_right_mm: Number.isFinite(n) ? n : 4 });
                                                    }}
                                                />
                                                <Input
                                                    label="Bottom"
                                                    type="number"
                                                    min={0}
                                                    max={25}
                                                    step={0.5}
                                                    compact
                                                    helperText="mm"
                                                    value={String(receiptSettings.margin_bottom_mm ?? 2)}
                                                    onChange={e => {
                                                        const n = parseFloat(e.target.value);
                                                        setReceiptSettings({ ...receiptSettings, margin_bottom_mm: Number.isFinite(n) ? n : 2 });
                                                    }}
                                                />
                                                <Input
                                                    label="Left"
                                                    type="number"
                                                    min={0}
                                                    max={25}
                                                    step={0.5}
                                                    compact
                                                    helperText="mm"
                                                    value={String(receiptSettings.margin_left_mm ?? 2)}
                                                    onChange={e => {
                                                        const n = parseFloat(e.target.value);
                                                        setReceiptSettings({ ...receiptSettings, margin_left_mm: Number.isFinite(n) ? n : 2 });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            </div>
                            <Card className="border-none shadow-sm p-5">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">🧾 Receipt Print Settings</h3>
                                <p className="text-xs text-muted-foreground mb-4">Monospace fonts keep columns aligned on thermal paper. If a web font cannot load, text falls back to Courier New.</p>
                                {receiptSettingsLoading ? (
                                    <p className="text-muted-foreground text-sm">Loading...</p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                                            <div className="sm:col-span-2 xl:col-span-1">
                                                <label htmlFor="pos-print-font-family" className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Font family</label>
                                                <select
                                                    id="pos-print-font-family"
                                                    className="w-full h-10 px-3 bg-muted/80 border-2 border-border rounded-xl text-sm font-bold text-foreground"
                                                    value={receiptSettings.print_font_family || 'roboto_mono'}
                                                    onChange={e => setReceiptSettings({ ...receiptSettings, print_font_family: e.target.value })}
                                                >
                                                    {RECEIPT_PRINT_FONT_OPTIONS.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}{opt.monospace ? ' — best for alignment (recommended)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <Input
                                                label="Font size (px)"
                                                type="number"
                                                min={10}
                                                max={18}
                                                compact
                                                value={String(receiptSettings.print_font_size ?? 12)}
                                                onChange={e => {
                                                    const n = parseInt(e.target.value, 10);
                                                    setReceiptSettings({
                                                        ...receiptSettings,
                                                        print_font_size: Number.isFinite(n) ? Math.min(18, Math.max(10, n)) : 12
                                                    });
                                                }}
                                            />
                                            <div>
                                                <label htmlFor="pos-print-font-weight" className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Font weight</label>
                                                <select
                                                    id="pos-print-font-weight"
                                                    className="w-full h-10 px-3 bg-muted/80 border-2 border-border rounded-xl text-sm font-bold text-foreground"
                                                    value={receiptSettings.print_font_weight || 'normal'}
                                                    onChange={e => setReceiptSettings({ ...receiptSettings, print_font_weight: e.target.value })}
                                                >
                                                    <option value="normal">Normal</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="bold">Bold</option>
                                                </select>
                                            </div>
                                            <Input
                                                label="Line spacing"
                                                type="number"
                                                min={1}
                                                max={2}
                                                step={0.05}
                                                compact
                                                helperText="line height"
                                                value={String(receiptSettings.print_line_spacing ?? 1.2)}
                                                onChange={e => {
                                                    const n = parseFloat(e.target.value);
                                                    setReceiptSettings({
                                                        ...receiptSettings,
                                                        print_line_spacing: Number.isFinite(n) ? Math.min(2, Math.max(1, n)) : 1.2
                                                    });
                                                }}
                                            />
                                        </div>
                                        {(() => {
                                            const sel = RECEIPT_PRINT_FONT_OPTIONS.find((o) => o.value === (receiptSettings.print_font_family || 'roboto_mono'));
                                            if (sel?.monospace) {
                                                return <p className="text-[11px] text-muted-foreground">Monospace fonts keep quantity and price columns aligned.</p>;
                                            }
                                            return (
                                                <p className="text-[11px] text-amber-700 dark:text-amber-400/90">
                                                    Proportional fonts can make narrow thermal columns look uneven; fixed column widths still help. Unsupported fonts fall back to Courier New.
                                                </p>
                                            );
                                        })()}
                                        <div className="flex flex-wrap gap-2 items-center">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => document.getElementById('pos-receipt-live-preview')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                                            >
                                                Preview sample receipt
                                            </Button>
                                            <span className="text-[11px] text-muted-foreground">Scrolls to the live preview (right, or below on small screens).</span>
                                        </div>
                                    </div>
                                )}
                            </Card>
                            <Card className="border-none shadow-sm p-5">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Store on receipt</h3>
                                {receiptSettingsLoading ? (
                                    <p className="text-muted-foreground text-sm">Loading...</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Input label="Shop name" placeholder="e.g. My Store" compact value={receiptSettings.shop_name || ''} onChange={e => setReceiptSettings({ ...receiptSettings, shop_name: e.target.value })} />
                                        <Input label="Phone" placeholder="021-1234567" compact value={receiptSettings.shop_phone || ''} onChange={e => setReceiptSettings({ ...receiptSettings, shop_phone: e.target.value })} />
                                        <div className="sm:col-span-2">
                                            <Input label="Address" placeholder="Street, city" compact value={receiptSettings.shop_address || ''} onChange={e => setReceiptSettings({ ...receiptSettings, shop_address: e.target.value })} />
                                        </div>
                                        <Input label="Tax ID / registration" placeholder="Optional" compact value={receiptSettings.tax_id || ''} onChange={e => setReceiptSettings({ ...receiptSettings, tax_id: e.target.value })} />
                                        <div className="sm:col-span-2">
                                            <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Receipt logo</span>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-muted/80 rounded-2xl border-2 border-dashed border-border">
                                                <div className="w-20 h-20 rounded-xl bg-card shadow-sm border border-border overflow-hidden flex items-center justify-center shrink-0">
                                                    {(receiptLogoBlobUrl || receiptSettings.logo_url) ? (
                                                        <img
                                                            src={receiptLogoBlobUrl || getFullImageUrl(receiptSettings.logo_url) || receiptSettings.logo_url}
                                                            alt="Receipt logo"
                                                            className="w-full h-full object-contain"
                                                        />
                                                    ) : (
                                                        <span className="text-2xl text-muted-foreground" aria-hidden>🧾</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 space-y-2">
                                                    <p className="text-xs text-muted-foreground">PNG, JPG, or WebP from your computer. Shown at the top of the receipt when &quot;Show logo&quot; is on. The preview updates as soon as you choose a file.</p>
                                                    <input
                                                        ref={receiptLogoFileInputRef}
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                                                        aria-label="Upload receipt logo image from your computer"
                                                        onChange={handleReceiptLogoUpload}
                                                    />
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            disabled={receiptLogoUploading}
                                                            onClick={() => receiptLogoFileInputRef.current?.click()}
                                                        >
                                                            {receiptLogoUploading ? 'Uploading…' : 'Upload logo'}
                                                        </Button>
                                                        {(receiptSettings.logo_url || receiptLogoBlobUrl) && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                disabled={receiptLogoUploading}
                                                                onClick={async () => {
                                                                    setReceiptLogoBlobUrl(null);
                                                                    try {
                                                                        const next = { ...receiptSettings, logo_url: '' };
                                                                        const saved = await shopApi.updateReceiptSettings(next);
                                                                        setReceiptSettings(saved);
                                                                    } catch {
                                                                        setReceiptSettings({ ...receiptSettings, logo_url: '' });
                                                                        alert('Could not save. Use Save receipt template to clear the logo on the server.');
                                                                    }
                                                                }}
                                                            >
                                                                Remove logo
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                                            <input type="checkbox" checked={!!receiptSettings.show_logo} onChange={e => setReceiptSettings({ ...receiptSettings, show_logo: e.target.checked })} className="rounded border-slate-300" />
                                            <span className="text-sm font-bold text-foreground">Show logo</span>
                                        </label>
                                    </div>
                                )}
                            </Card>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Card className="border-none shadow-sm p-5">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Barcode</h3>
                                    {receiptSettingsLoading ? (
                                        <p className="text-muted-foreground text-sm">Loading...</p>
                                    ) : (
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!receiptSettings.show_barcode} onChange={e => setReceiptSettings({ ...receiptSettings, show_barcode: e.target.checked })} className="rounded border-slate-300" />
                                                <span className="text-sm font-bold text-foreground">Show barcode</span>
                                            </label>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div>
                                                    <label htmlFor="pos-barcode-type" className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Type</label>
                                                    <select id="pos-barcode-type" className="w-full h-10 px-2 bg-muted/80 border-2 border-border rounded-xl text-xs font-bold text-foreground" value={receiptSettings.barcode_type || 'CODE128'} onChange={e => setReceiptSettings({ ...receiptSettings, barcode_type: e.target.value })}>
                                                        <option value="CODE128">CODE128</option>
                                                        <option value="CODE39">CODE39</option>
                                                        <option value="EAN13">EAN13</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label htmlFor="pos-barcode-size" className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Size</label>
                                                    <select id="pos-barcode-size" className="w-full h-10 px-2 bg-muted/80 border-2 border-border rounded-xl text-xs font-bold text-foreground" value={receiptSettings.barcode_size || 'medium'} onChange={e => setReceiptSettings({ ...receiptSettings, barcode_size: e.target.value })}>
                                                        <option value="small">Small</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="large">Large</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label htmlFor="pos-barcode-position" className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Position</label>
                                                    <select id="pos-barcode-position" className="w-full h-10 px-2 bg-muted/80 border-2 border-border rounded-xl text-xs font-bold text-foreground" value={receiptSettings.barcode_position || 'footer'} onChange={e => setReceiptSettings({ ...receiptSettings, barcode_position: e.target.value })}>
                                                        <option value="header">Header</option>
                                                        <option value="footer">Footer</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                                <Card className="border-none shadow-sm p-5">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Receipt details</h3>
                                    {receiptSettingsLoading ? (
                                        <p className="text-muted-foreground text-sm">Loading...</p>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!receiptSettings.show_tax_breakdown} onChange={e => setReceiptSettings({ ...receiptSettings, show_tax_breakdown: e.target.checked })} className="rounded border-slate-300" />
                                                <span className="text-sm font-medium text-foreground">Tax breakdown</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!receiptSettings.show_cashier_name} onChange={e => setReceiptSettings({ ...receiptSettings, show_cashier_name: e.target.checked })} className="rounded border-slate-300" />
                                                <span className="text-sm font-medium text-foreground">Cashier name</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!receiptSettings.show_shift_number} onChange={e => setReceiptSettings({ ...receiptSettings, show_shift_number: e.target.checked })} className="rounded border-slate-300" />
                                                <span className="text-sm font-medium text-foreground">Shift number</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!receiptSettings.show_mobile_url_qr} onChange={e => setReceiptSettings({ ...receiptSettings, show_mobile_url_qr: e.target.checked })} className="rounded border-slate-300" />
                                                <span className="text-sm font-medium text-foreground">Mobile order QR</span>
                                            </label>
                                        </div>
                                    )}
                                    {!receiptSettingsLoading && (
                                        <p className="text-[11px] text-muted-foreground mt-2">QR shows &quot;Please scan to order from home&quot; when mobile ordering is enabled.</p>
                                    )}
                                </Card>
                            </div>
                            <Card className="border-none shadow-sm p-5">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Footer</h3>
                                {receiptSettingsLoading ? (
                                    <p className="text-muted-foreground text-sm">Loading...</p>
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                                        <div className="flex-1 min-w-0">
                                            <Input label="Footer message" placeholder="Thank you for your business!" compact value={receiptSettings.footer_message || ''} onChange={e => setReceiptSettings({ ...receiptSettings, footer_message: e.target.value })} />
                                        </div>
                                        <Button type="button" className="shrink-0" onClick={handleSaveReceiptSettings}>Save receipt template</Button>
                                    </div>
                                )}
                            </Card>
                        </div>
                        <div className="w-full xl:w-[400px] xl:max-w-[400px] flex-shrink-0">
                            <div className="xl:sticky xl:top-6">
                                <ReceiptPreviewPanel receiptSettings={receiptSettings} logoUrlOverride={receiptLogoBlobUrl} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* User Modal */}
            <Modal
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                title={editingUser ? 'Edit User' : 'New User'}
                size="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Full Name"
                            placeholder="e.g. John Doe"
                            value={userForm.name}
                            onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                        />
                        <Input
                            label="Username"
                            placeholder="e.g. johndoe"
                            value={userForm.username}
                            onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                            disabled={!!editingUser}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Email Address"
                            placeholder="Optional"
                            value={userForm.email}
                            onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                        />
                        <div>
                            <label htmlFor="settings-user-role" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role</label>
                            <select
                                id="settings-user-role"
                                className="w-full h-11 px-4 bg-muted/80 border-2 border-border rounded-xl text-sm font-bold text-foreground outline-none focus:border-indigo-500 transition-all appearance-none"
                                value={userForm.role}
                                onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                            >
                                <option value="admin">Admin</option>
                                <option value="accountant">Accountant</option>
                                <option value="pos_cashier">POS Cashier</option>
                            </select>
                        </div>
                    </div>
                    <Input
                        label={editingUser ? 'Change Password (leave blank to keep current)' : 'Password'}
                        type="password"
                        placeholder="••••••••"
                        value={userForm.password}
                        onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveUser}>
                            {editingUser ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* New delivery rider */}
            <Modal
                isOpen={isRiderCreateModalOpen}
                onClose={() => setIsRiderCreateModalOpen(false)}
                title="New delivery rider"
                size="lg"
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        The rider signs in on the rider app using your shop slug, this phone number (Pakistan mobile), and the password below.
                    </p>
                    <Input
                        label="Full name"
                        placeholder="e.g. Ali Khan"
                        value={riderCreateForm.name}
                        onChange={(e) => setRiderCreateForm({ ...riderCreateForm, name: e.target.value })}
                    />
                    <Input
                        label="Phone"
                        placeholder="e.g. 0312 3456789 or +92312..."
                        value={riderCreateForm.phone}
                        onChange={(e) => setRiderCreateForm({ ...riderCreateForm, phone: e.target.value })}
                    />
                    <Input
                        label="Password"
                        type="password"
                        placeholder="••••••••"
                        value={riderCreateForm.password}
                        onChange={(e) => setRiderCreateForm({ ...riderCreateForm, password: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsRiderCreateModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveRider}>Create rider</Button>
                    </div>
                </div>
            </Modal>

            {/* Reset rider password */}
            <Modal
                isOpen={!!riderPasswordTarget}
                onClose={() => {
                    setRiderPasswordTarget(null);
                    setRiderPasswordValue('');
                }}
                title={riderPasswordTarget ? `Set password — ${riderPasswordTarget.name}` : 'Set password'}
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground font-mono">{riderPasswordTarget?.phone_number}</p>
                    <Input
                        label="New password"
                        type="password"
                        placeholder="••••••••"
                        value={riderPasswordValue}
                        onChange={(e) => setRiderPasswordValue(e.target.value)}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setRiderPasswordTarget(null);
                                setRiderPasswordValue('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSaveRiderPassword}>Save password</Button>
                    </div>
                </div>
            </Modal>

            {/* Rider activity */}
            <Modal
                isOpen={!!riderActivityTarget}
                onClose={() => { setRiderActivityTarget(null); setRiderActivity([]); }}
                title={riderActivityTarget ? `Delivery activity — ${riderActivityTarget.name}` : 'Delivery activity'}
                size="lg"
            >
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground font-mono">{riderActivityTarget?.phone_number}</p>
                    {riderActivityLoading ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
                    ) : riderActivity.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No delivery activity found for this rider.</p>
                    ) : (
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-background">
                                    <tr className="text-left text-xs text-muted-foreground border-b">
                                        <th className="px-3 py-2">Order #</th>
                                        <th className="px-3 py-2">Status</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2">Assigned</th>
                                        <th className="px-3 py-2">Delivered</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {riderActivity.map((a) => (
                                        <tr key={a.delivery_order_id} className="border-b last:border-0 hover:bg-muted/40">
                                            <td className="px-3 py-2 font-medium">{a.order_number}</td>
                                            <td className="px-3 py-2">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    a.delivery_status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                                                    a.delivery_status === 'ON_THE_WAY' ? 'bg-blue-100 text-blue-700' :
                                                    a.delivery_status === 'PICKED' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {a.delivery_status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">{Number(a.grand_total).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—'}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{a.delivered_at ? new Date(a.delivered_at).toLocaleString() : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex justify-end pt-2">
                        <Button variant="secondary" onClick={() => { setRiderActivityTarget(null); setRiderActivity([]); }}>Close</Button>
                    </div>
                </div>
            </Modal>

            {/* Clear transactions confirmation */}
            <Modal
                isOpen={clearTransactionsConfirm}
                onClose={() => !clearingTransactions && setClearTransactionsConfirm(false)}
                title="Clear all transactions?"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        This will permanently delete all sales transactions, orders, journal entries, ledger entries, transaction history, purchase bills, and bill payments. Settings, chart of accounts, bank accounts, users, vendors, products, and inventories will be kept.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setClearTransactionsConfirm(false)} disabled={clearingTransactions}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleClearAllTransactions}
                            disabled={clearingTransactions}
                            className="bg-amber-600 hover:bg-amber-700 border-amber-600"
                        >
                            {clearingTransactions ? 'Clearing…' : 'Clear all transactions'}
                        </Button>
                    </div>
                </div>
            </Modal>

            </div>
            {settingsLock.mode === 'loading' && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-[2px] pointer-events-auto">
                    <p className="text-muted-foreground text-sm font-medium">Preparing Settings…</p>
                </div>
            )}
            {(settingsLock.mode === 'blocked' || settingsLock.lostLock) && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4 pointer-events-auto">
                    <Card className="max-w-md w-full p-6 space-y-4 shadow-lg border-border">
                        <h2 className="text-lg font-semibold text-foreground">Another user is editing Settings</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {settingsLock.blockedByName ||
                                'Someone else is editing Settings on this organization. Stop editing until they finish so changes are not lost.'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            This page will try again automatically when the other user leaves Settings. You can also use Try again after they close the tab.
                        </p>
                        <Button type="button" onClick={() => void settingsLock.retryAcquire()} className="w-full sm:w-auto">
                            Try again
                        </Button>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default function SettingsPage() {
    return (
        <AccountingProvider>
            <SettingsContent />
        </AccountingProvider>
    );
}
