import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Pencil, RefreshCw } from 'lucide-react';
import { shopApi, ShopBranch } from '../../../services/shopApi';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';

function parseNum(v: string): number | null {
    const n = parseFloat(v.trim());
    return Number.isFinite(n) ? n : null;
}

export const BranchConfigurationSection: React.FC = () => {
    const [branches, setBranches] = useState<ShopBranch[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<ShopBranch | null>(null);
    const [form, setForm] = useState({
        name: '',
        latitude: '',
        longitude: '',
        max_delivery_distance_km: '',
        is_active: true,
    });

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = await shopApi.getBranches();
            setBranches(Array.isArray(list) ? list : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load branches');
            setBranches([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openEdit = (b: ShopBranch) => {
        setEditing(b);
        setForm({
            name: b.name || '',
            latitude: b.latitude != null && b.latitude !== '' ? String(b.latitude) : '',
            longitude: b.longitude != null && b.longitude !== '' ? String(b.longitude) : '',
            max_delivery_distance_km:
                b.max_delivery_distance_km != null && b.max_delivery_distance_km !== ''
                    ? String(b.max_delivery_distance_km)
                    : '',
            is_active: b.is_active !== false,
        });
    };

    const closeEdit = () => {
        setEditing(null);
    };

    const save = async () => {
        if (!editing) return;
        const lat = parseNum(form.latitude);
        const lng = parseNum(form.longitude);
        if (lat == null || lng == null) {
            alert('Latitude and longitude are required for delivery routing.');
            return;
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            alert('Latitude must be between -90 and 90, longitude between -180 and 180.');
            return;
        }
        let maxKm: number | null = null;
        if (form.max_delivery_distance_km.trim() !== '') {
            const m = parseNum(form.max_delivery_distance_km);
            if (m == null || m <= 0) {
                alert('Max delivery distance must be greater than 0 km (or leave blank to use shop default).');
                return;
            }
            maxKm = m;
        }

        setSaving(true);
        setError('');
        try {
            await shopApi.updateBranch(editing.id, {
                name: form.name.trim() || editing.name,
                latitude: lat,
                longitude: lng,
                max_delivery_distance_km: maxKm,
                is_active: form.is_active,
            });
            await load();
            closeEdit();
        } catch (e: any) {
            alert(e?.message || e?.error || 'Failed to save branch');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="border-none shadow-sm p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Branch configuration
                        </h3>
                        <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                            Set each branch&apos;s map coordinates and maximum delivery distance. Orders are assigned to the
                            nearest branch that can fulfill stock and is within range. Branches without coordinates cannot be
                            used for automatic delivery routing.
                        </p>
                    </div>
                    <Button type="button" variant="secondary" className="gap-2" onClick={() => void load()} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading branches…</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left">
                                <tr>
                                    <th className="p-3 font-semibold">Branch</th>
                                    <th className="p-3 font-semibold">Coordinates</th>
                                    <th className="p-3 font-semibold">Max km</th>
                                    <th className="p-3 font-semibold">Active</th>
                                    <th className="p-3 font-semibold w-24" />
                                </tr>
                            </thead>
                            <tbody>
                                {branches.map((b) => (
                                    <tr key={b.id} className="border-t border-border">
                                        <td className="p-3 align-top">
                                            <div className="font-medium text-foreground">{b.name}</div>
                                            <div className="text-xs text-muted-foreground">{b.code}</div>
                                        </td>
                                        <td className="p-3 align-top text-muted-foreground font-mono text-xs">
                                            {b.latitude != null && b.longitude != null ? (
                                                <>
                                                    {String(b.latitude)}, {String(b.longitude)}
                                                </>
                                            ) : (
                                                <span className="text-amber-600 dark:text-amber-400">Not set</span>
                                            )}
                                        </td>
                                        <td className="p-3 align-top">
                                            {b.max_delivery_distance_km != null && b.max_delivery_distance_km !== ''
                                                ? `${b.max_delivery_distance_km} km`
                                                : <span className="text-muted-foreground">Default</span>}
                                        </td>
                                        <td className="p-3 align-top">
                                            {b.is_active === false ? (
                                                <span className="text-amber-700 dark:text-amber-300">Inactive</span>
                                            ) : (
                                                <span className="text-emerald-700 dark:text-emerald-300">Yes</span>
                                            )}
                                        </td>
                                        <td className="p-3 align-top">
                                            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(b)}>
                                                <Pencil className="w-4 h-4" />
                                                Edit
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal isOpen={!!editing} onClose={closeEdit} title="Edit branch delivery settings">
                {editing && (
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Branch name</label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                className="mt-1"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Latitude</label>
                                <Input
                                    value={form.latitude}
                                    onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                                    placeholder="e.g. 24.8607"
                                    className="mt-1 font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Longitude</label>
                                <Input
                                    value={form.longitude}
                                    onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                                    placeholder="e.g. 67.0011"
                                    className="mt-1 font-mono"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase">
                                Max delivery distance (km)
                            </label>
                            <Input
                                value={form.max_delivery_distance_km}
                                onChange={(e) => setForm((f) => ({ ...f, max_delivery_distance_km: e.target.value }))}
                                placeholder="Blank = use shop default from mobile ordering settings"
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Must be greater than 0 when set.</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                className="rounded border-border"
                            />
                            <span className="text-sm">Include in automatic delivery routing</span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={closeEdit} disabled={saving}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={() => void save()} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
