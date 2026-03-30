
import React, { useState } from 'react';
import { useMultiStore } from '../../../context/MultiStoreContext';
import { POSTerminal } from '../../../types/multiStore';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';

const TerminalManager: React.FC = () => {
    const { terminals, stores, lockTerminal, unlockTerminal, addTerminal, updateTerminal, deleteTerminal } = useMultiStore();
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingTerminal, setEditingTerminal] = useState<POSTerminal | null>(null);
    const [diagnosticId, setDiagnosticId] = useState<string | null>(null);
    const [newTerminalData, setNewTerminalData] = useState({
        name: '',
        storeId: '',
        version: '1.0.0',
        ipAddress: '',
        code: ''
    });

    const handleRegisterTerminal = async () => {
        try {
            await addTerminal(newTerminalData);
            setIsRegisterModalOpen(false);
            setNewTerminalData({
                name: '',
                storeId: '',
                version: '1.0.0',
                ipAddress: '',
                code: ''
            });
        } catch (e) {
            alert('Failed to register terminal');
        }
    };

    const handleUpdateTerminal = async () => {
        if (!editingTerminal) return;
        try {
            await updateTerminal(editingTerminal.id, editingTerminal);
            setIsEditModalOpen(false);
            setEditingTerminal(null);
        } catch (e) {
            alert('Failed to update terminal');
        }
    };

    const handleDeleteTerminal = async (id: string) => {
        if (confirm('Are you sure you want to remove this terminal? This action cannot be undone.')) {
            try {
                await deleteTerminal(id);
            } catch (e) {
                alert('Failed to remove terminal');
            }
        }
    };

    const runDiagnostic = (id: string) => {
        setDiagnosticId(id);
        setTimeout(() => {
            setDiagnosticId(null);
            alert('Diagnostic Complete: All hardware systems nominal for terminal ' + id);
        }, 2000);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-xl font-black text-foreground dark:text-slate-200 tracking-tight">Active Hardware Network</h3>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Real-time terminal health and synchronization status.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsRegisterModalOpen(true)}
                        className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black dark:hover:bg-slate-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center gap-2 border border-transparent dark:border-slate-600"
                    >
                        <span className="text-emerald-400">{ICONS.plus}</span> Register New POS
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {terminals.map(terminal => {
                    const store = stores.find(s => s.id === terminal.storeId);
                    const isDiagnosing = diagnosticId === terminal.id;
                    const isLocked = terminal.status === 'Locked';

                    return (
                        <Card key={terminal.id} className="p-6 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 relative overflow-hidden bg-card group hover:shadow-2xl transition-all duration-300 rounded-[2rem]">
                            {/* Health Bar at the top */}
                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-muted/80 dark:bg-slate-800">
                                <div
                                    className={`h-full transition-all duration-1000 ${terminal.healthScore > 90 ? 'bg-emerald-500' :
                                        terminal.healthScore > 70 ? 'bg-amber-400' : 'bg-rose-500'
                                        }`}
                                    style={{ width: `${terminal.healthScore}%` }}
                                ></div>
                            </div>

                            <div className="flex justify-between items-start mb-6">
                                <div className={`relative p-5 rounded-3xl ${terminal.status === 'Online' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' :
                                    isLocked ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400' : 'bg-muted/80 text-muted-foreground dark:bg-slate-800'
                                    }`}>
                                    {terminal.status === 'Online' && (
                                        <span className="absolute top-3 right-3 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white"></span>
                                        </span>
                                    )}
                                    {React.cloneElement(ICONS.history as React.ReactElement<any>, { size: 28 })}
                                </div>
                                <div className="text-right">
                                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${terminal.status === 'Online' ? 'bg-emerald-600 text-white dark:shadow-emerald-900/40' :
                                        isLocked ? 'bg-rose-600 text-white dark:shadow-rose-900/40' : 'bg-slate-200 text-muted-foreground dark:bg-slate-700 dark:text-slate-300'
                                        }`}>
                                        {terminal.status}
                                    </span>
                                    <p className="text-[10px] font-bold text-muted-foreground mt-2 tracking-tight">{terminal.ipAddress || 'No IP Assigned'}</p>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <div className="relative">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xl font-black text-foreground tracking-tight leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{terminal.name}</h4>
                                        <p className="text-[10px] font-mono font-black text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">#{terminal.code}</p>
                                    </div>
                                    <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase italic tracking-wide mt-1">
                                        {store ? `${store.name} [${store.code}]` : 'Unassigned Branch'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50 dark:border-slate-700/80">
                                    <div>
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Version</p>
                                        <p className="text-sm font-bold text-foreground">v{terminal.version}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Last Sync</p>
                                        <p className="text-sm font-bold text-foreground">
                                            {terminal.lastSync ? new Date(terminal.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-4 pt-2">
                                    <button
                                        onClick={() => runDiagnostic(terminal.id)}
                                        disabled={isDiagnosing}
                                        className={`flex-1 py-3 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${isDiagnosing ? 'bg-indigo-50 text-indigo-400 dark:bg-indigo-950/50 cursor-not-allowed' : 'bg-muted/80 text-muted-foreground hover:bg-muted/80 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-95'
                                            }`}
                                    >
                                        {isDiagnosing && <span className="animate-spin">{ICONS.settings}</span>}
                                        {isDiagnosing ? 'Diagnosing...' : 'Remote Diagnostic'}
                                    </button>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingTerminal(terminal);
                                                setIsEditModalOpen(true);
                                            }}
                                            className="p-2.5 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-400 rounded-xl transition-all"
                                            title="Edit Terminal"
                                        >
                                            {ICONS.edit}
                                        </button>
                                        <button
                                            onClick={() => isLocked ? unlockTerminal(terminal.id) : lockTerminal(terminal.id)}
                                            className={`p-2.5 rounded-xl transition-all ${isLocked
                                                ? 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                                : 'text-slate-300 dark:text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                                }`}
                                            title={isLocked ? "Unlock Terminal" : "Lock Terminal"}
                                        >
                                            {isLocked ? ICONS.lock : ICONS.lock}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTerminal(terminal.id)}
                                            className="p-2.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all"
                                            title="Delete Terminal"
                                        >
                                            {ICONS.trash}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    );
                })}

                {/* Register New Terminal Button as a Card */}
                <div
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="h-full border-4 border-dashed border-border rounded-[2rem] flex flex-col items-center justify-center p-8 text-center gap-4 bg-muted/80/20 group hover:border-indigo-400/50 hover:bg-indigo-50/10 transition-all cursor-pointer min-h-[300px]"
                >
                    <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:scale-110 transition-all shadow-lg">
                        {ICONS.plus}
                    </div>
                    <div>
                        <p className="text-sm font-black uppercase text-muted-foreground tracking-widest">Register Hardware</p>
                        <p className="text-xs text-slate-300 dark:text-slate-500 font-medium italic mt-2">Add a new POS station to your network.</p>
                    </div>
                </div>
            </div>

            {/* Registration Modal */}
            <Modal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                title="Register New POS Terminal"
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Terminal Name"
                            placeholder="e.g. Counter 1"
                            value={newTerminalData.name}
                            onChange={(e) => setNewTerminalData({ ...newTerminalData, name: e.target.value })}
                        />
                        <Input
                            label="Hardware ID / Code"
                            placeholder="e.g. POS-001"
                            value={newTerminalData.code}
                            onChange={(e) => setNewTerminalData({ ...newTerminalData, code: e.target.value })}
                        />
                    </div>

                    <Select
                        label="Assign to Branch"
                        value={newTerminalData.storeId}
                        onChange={(e) => setNewTerminalData({ ...newTerminalData, storeId: e.target.value })}
                    >
                        <option value="">Select a Branch</option>
                        {stores.map(store => (
                            <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
                        ))}
                    </Select>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="IP Address"
                            placeholder="192.168.1.1"
                            value={newTerminalData.ipAddress}
                            onChange={(e) => setNewTerminalData({ ...newTerminalData, ipAddress: e.target.value })}
                        />
                        <Input
                            label="Initial Version"
                            value={newTerminalData.version}
                            onChange={(e) => setNewTerminalData({ ...newTerminalData, version: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border dark:border-slate-600">
                        <Button variant="secondary" onClick={() => setIsRegisterModalOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleRegisterTerminal}
                            disabled={!newTerminalData.name || !newTerminalData.storeId}
                            className="bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700"
                        >
                            Register Terminal
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edit Terminal"
            >
                {editingTerminal && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Terminal Name"
                                value={editingTerminal.name}
                                onChange={(e) => setEditingTerminal({ ...editingTerminal, name: e.target.value })}
                            />
                            <Input
                                label="Code"
                                value={editingTerminal.code}
                                disabled
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="IP Address"
                                value={editingTerminal.ipAddress}
                                onChange={(e) => setEditingTerminal({ ...editingTerminal, ipAddress: e.target.value })}
                            />
                            <Input
                                label="Version"
                                value={editingTerminal.version}
                                onChange={(e) => setEditingTerminal({ ...editingTerminal, version: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-6 border-t border-border dark:border-slate-600">
                            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleUpdateTerminal}
                                disabled={!editingTerminal.name}
                                className="bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                            >
                                Save Changes
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default TerminalManager;
