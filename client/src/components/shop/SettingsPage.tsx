import React, { useState, useEffect, useCallback } from 'react';
// MyShop Settings Page - Reorganized Chart of Accounts
import { useAppContext } from '../../context/AppContext';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { shopApi, accountingApi, ShopBankAccount, ShopVendor } from '../../services/shopApi';
import Card from '../ui/Card';
import { AccountingProvider } from '../../context/AccountingContext';
import ChartOfAccounts from './accounting/ChartOfAccounts';

function toState(v: ShopVendor) {
    return {
        id: v.id,
        name: v.name,
        companyName: v.company_name,
        contactNo: v.contact_no,
        email: v.email,
        address: v.address,
        description: v.description,
    };
}

declare global {
    interface Window {
        electronAPI?: {
            getAppVersion: () => Promise<string>;
            checkForUpdates: () => Promise<void>;
            onUpdateStatus: (cb: (payload: { status: string; message?: string; version?: string; percent?: number }) => void) => () => void;
            startUpdateDownload: () => Promise<void>;
            quitAndInstall: () => Promise<void>;
        };
    }
}

const SettingsContent: React.FC = () => {
    const { dispatch } = useAppContext();
    const [activeTab, setActiveTab] = useState<'coa' | 'vendors' | 'users' | 'app' | 'data'>('coa');

    const [vendors, setVendors] = useState<ShopVendor[]>([]);
    const [vendorsLoading, setVendorsLoading] = useState(true);
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState<ShopVendor | null>(null);
    const [vendorForm, setVendorForm] = useState({
        name: '', company_name: '', contact_no: '', email: '', address: '', description: ''
    });

    const [users, setUsers] = useState<any[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [userForm, setUserForm] = useState({
        username: '', name: '', email: '', password: '', role: 'pos_cashier'
    });

    const [appVersion, setAppVersion] = useState<string | null>(null);
    const [updateStatus, setUpdateStatus] = useState<{ status: string; message?: string; version?: string; percent?: number } | null>(null);
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

    const [clearTransactionsConfirm, setClearTransactionsConfirm] = useState(false);
    const [clearingTransactions, setClearingTransactions] = useState(false);

    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;
        window.electronAPI.getAppVersion().then(setAppVersion);
    }, [isElectron]);

    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;
        const unsub = window.electronAPI.onUpdateStatus((payload) => setUpdateStatus(payload));
        return unsub;
    }, [isElectron]);

    const handleCheckForUpdates = useCallback(() => {
        if (!window.electronAPI) return;
        setUpdateStatus({ status: 'checking' });
        window.electronAPI.checkForUpdates();
    }, []);

    const handleDownloadUpdate = useCallback(() => {
        if (!window.electronAPI) return;
        window.electronAPI.startUpdateDownload();
    }, []);

    const handleQuitAndInstall = useCallback(() => {
        if (!window.electronAPI) return;
        window.electronAPI.quitAndInstall();
    }, []);

    const loadVendors = useCallback(async () => {
        try {
            setVendorsLoading(true);
            const list = await shopApi.getVendors();
            setVendors(Array.isArray(list) ? list : []);
        } catch {
            setVendors([]);
        } finally {
            setVendorsLoading(false);
        }
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

    useEffect(() => {
        if (activeTab === 'vendors') loadVendors();
        if (activeTab === 'users') loadUsers();
    }, [activeTab, loadVendors, loadUsers]);

    const openNewVendor = () => {
        setEditingVendor(null);
        setVendorForm({ name: '', company_name: '', contact_no: '', email: '', address: '', description: '' });
        setIsVendorModalOpen(true);
    };

    const openEditVendor = (v: ShopVendor) => {
        setEditingVendor(v);
        setVendorForm({
            name: v.name,
            company_name: v.company_name || '',
            contact_no: v.contact_no || '',
            email: v.email || '',
            address: v.address || '',
            description: v.description || ''
        });
        setIsVendorModalOpen(true);
    };

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

    const handleSaveVendor = async () => {
        if (!vendorForm.name.trim()) return;
        try {
            if (editingVendor) {
                await shopApi.updateVendor(editingVendor.id, vendorForm);
                dispatch({ type: 'UPDATE_VENDOR', payload: toState({ ...vendorForm, id: editingVendor.id } as ShopVendor) });
            } else {
                const created = await shopApi.createVendor(vendorForm);
                dispatch({ type: 'ADD_VENDOR', payload: toState(created) });
            }
            setIsVendorModalOpen(false);
            loadVendors();
        } catch (e: any) {
            alert(e?.message || 'Failed to save vendor');
        }
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

    const handleDeactivateVendor = async (id: string) => {
        if (!confirm('Deactivate this vendor? They will no longer appear in Procurement.')) return;
        try {
            await shopApi.deleteVendor(id);
            loadVendors();
        } catch (e: any) {
            alert(e?.message || 'Failed to deactivate');
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

    const tabs = [
        { id: 'coa' as const, label: 'Chart of Accounts', icon: ICONS.list },
        { id: 'vendors' as const, label: 'Vendor Management', icon: ICONS.briefcase },
        { id: 'users' as const, label: 'User Management', icon: ICONS.users },
        { id: 'data' as const, label: 'Data', icon: ICONS.trash },
        { id: 'app' as const, label: 'App', icon: ICONS.download },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
            <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10">
                <div className="mb-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Settings</h1>
                    <p className="text-slate-500 text-sm font-medium">Chart of accounts, vendor management, and team roles.</p>
                </div>
                <div className="flex gap-8">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === tab.id
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<{ width?: number; height?: number }>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">

                {activeTab === 'coa' && (
                    <ChartOfAccounts />
                )}

                {activeTab === 'data' && (
                    <div className="space-y-6 max-w-xl">
                        <Card className="border-none shadow-sm p-6">
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Clear all transactions</h3>
                            <p className="text-slate-600 text-sm mb-4">
                                Remove all sales transactions, orders, journal entries, and transaction history. Settings, chart of accounts, bank accounts, users, vendors, products, and inventories (stock levels and movement history) are kept.
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
                    <div className="space-y-6 max-w-xl">
                        <Card className="border-none shadow-sm p-6">
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Desktop app</h3>
                            {appVersion != null && (
                                <p className="text-slate-600 text-sm mb-4">Current version: <span className="font-bold text-slate-800">{appVersion}</span></p>
                            )}
                            {isElectron ? (
                                <div className="space-y-3">
                                    <Button
                                        onClick={handleCheckForUpdates}
                                        disabled={updateStatus?.status === 'checking' || updateStatus?.status === 'downloading'}
                                        className="flex items-center gap-2"
                                    >
                                        {updateStatus?.status === 'checking' || updateStatus?.status === 'downloading' ? (
                                            <>Checking…</>
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
                                    {updateStatus?.status === 'downloading' && (
                                        <p className="text-slate-600 text-sm">
                                            Downloading… {updateStatus.percent != null ? `${Math.round(updateStatus.percent)}%` : ''}
                                        </p>
                                    )}
                                    {updateStatus?.status === 'downloaded' && (
                                        <div className="flex items-center gap-3 pt-2">
                                            <p className="text-emerald-600 text-sm font-medium">Update ready. Restart the app to install.</p>
                                            <Button onClick={handleQuitAndInstall}>Restart to install</Button>
                                        </div>
                                    )}
                                    {updateStatus?.status === 'not-available' && (
                                        <p className="text-slate-500 text-sm pt-2">You’re on the latest version.</p>
                                    )}
                                    {(updateStatus?.status === 'error' || updateStatus?.status === 'unavailable') && updateStatus?.message && (
                                        <p className="text-amber-600 text-sm pt-2">{updateStatus.message}</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">Update check is available in the installed desktop app only.</p>
                            )}
                        </Card>
                    </div>
                )}

                {activeTab === 'vendors' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <p className="text-slate-600 text-sm">Vendors are used in Procurement when recording stock-in and purchases.</p>
                            <Button onClick={openNewVendor} className="flex items-center gap-2">
                                {ICONS.plus} New Vendor
                            </Button>
                        </div>
                        <Card className="border-none shadow-sm overflow-hidden">
                            {vendorsLoading ? (
                                <div className="p-12 text-center text-slate-400">Loading...</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                                            <tr>
                                                <th className="px-6 py-4">Name</th>
                                                <th className="px-6 py-4">Company</th>
                                                <th className="px-6 py-4">Contact</th>
                                                <th className="px-6 py-4">Email</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {vendors.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                                                        No vendors yet. Create one to use in Procurement.
                                                    </td>
                                                </tr>
                                            ) : (
                                                vendors.map(v => (
                                                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-6 py-4 font-bold text-slate-800">{v.name}</td>
                                                        <td className="px-6 py-4 text-slate-600">{v.company_name || '—'}</td>
                                                        <td className="px-6 py-4 text-slate-600">{v.contact_no || '—'}</td>
                                                        <td className="px-6 py-4 text-slate-600">{v.email || '—'}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${v.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                {v.is_active ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            {v.is_active && (
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={() => openEditVendor(v)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                                                                        {ICONS.edit}
                                                                    </button>
                                                                    <button onClick={() => handleDeactivateVendor(v.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                                                                        {ICONS.trash}
                                                                    </button>
                                                                </div>
                                                            )}
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
                )}

                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <p className="text-slate-600 text-sm">Manage team members and their access roles (Admin, Accountant, POS Cashier).</p>
                            <Button onClick={openNewUser} className="flex items-center gap-2">
                                {ICONS.plus} New User
                            </Button>
                        </div>
                        <Card className="border-none shadow-sm overflow-hidden">
                            {usersLoading ? (
                                <div className="p-12 text-center text-slate-400">Loading users...</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                                            <tr>
                                                <th className="px-6 py-4">Name / Username</th>
                                                <th className="px-6 py-4">Role</th>
                                                <th className="px-6 py-4">Email</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {users.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 text-sm">
                                                        No users found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                users.map(u => (
                                                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="font-bold text-slate-800">{u.name}</div>
                                                            <div className="text-[10px] text-slate-400 font-mono">@{u.username}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shadow-sm ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                                                                u.role === 'accountant' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-slate-100 text-slate-700'
                                                                }`}>
                                                                {u.role.replace('_', ' ')}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-slate-600">{u.email || '—'}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                {u.is_active ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={() => openEditUser(u)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                                                                    {ICONS.edit}
                                                                </button>
                                                                {u.is_active && u.role !== 'admin' && (
                                                                    <button onClick={() => handleDeactivateUser(u.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                                                                        {ICONS.trash}
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
                        </Card>
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
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Role</label>
                            <select
                                className="w-full h-11 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all appearance-none"
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

            {/* Clear transactions confirmation */}
            <Modal
                isOpen={clearTransactionsConfirm}
                onClose={() => !clearingTransactions && setClearTransactionsConfirm(false)}
                title="Clear all transactions?"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-slate-600 text-sm">
                        This will permanently delete all sales transactions, orders, journal entries, ledger entries, and transaction history. Settings, chart of accounts, bank accounts, users, vendors, products, and inventories will be kept.
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

            {/* Vendor Modal */}
            <Modal
                isOpen={isVendorModalOpen}
                onClose={() => setIsVendorModalOpen(false)}
                title={editingVendor ? 'Edit Vendor' : 'New Vendor'}
                size="lg"
            >
                <div className="space-y-4">
                    <Input
                        label="Vendor Name"
                        placeholder="Contact or business name"
                        value={vendorForm.name}
                        onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })}
                    />
                    <Input
                        label="Company Name"
                        placeholder="Optional"
                        value={vendorForm.company_name}
                        onChange={e => setVendorForm({ ...vendorForm, company_name: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Contact No"
                            placeholder="Phone"
                            value={vendorForm.contact_no}
                            onChange={e => setVendorForm({ ...vendorForm, contact_no: e.target.value })}
                        />
                        <Input
                            label="Email"
                            placeholder="Optional"
                            value={vendorForm.email}
                            onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                        />
                    </div>
                    <Input
                        label="Address"
                        placeholder="Optional"
                        value={vendorForm.address}
                        onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })}
                    />
                    <Input
                        label="Description / Notes"
                        placeholder="Optional"
                        value={vendorForm.description}
                        onChange={e => setVendorForm({ ...vendorForm, description: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsVendorModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveVendor} disabled={!vendorForm.name.trim()}>
                            {editingVendor ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </div>
            </Modal>
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
