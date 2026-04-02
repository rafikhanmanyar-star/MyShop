import React, { useState, useEffect, useRef } from 'react';
import { shopApi, TenantBranding } from '../../services/shopApi';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { getFullImageUrl } from '../../config/apiUrl';

export default function MobileAppBranding() {
    const [branding, setBranding] = useState<TenantBranding | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadBranding();
    }, []);

    const loadBranding = async () => {
        try {
            setLoading(true);
            const data = await shopApi.getBranding();
            setBranding(data);
        } catch (error) {
            console.error('Failed to load branding', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!branding) return;
        try {
            setSaving(true);
            await shopApi.updateBranding(branding);
            alert('Branding updated successfully!');
        } catch (error) {
            console.error('Failed to update branding', error);
            alert('Failed to update branding.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !branding) return;

        try {
            setUploading(true);
            const res = await shopApi.uploadImage(file);
            setBranding({ ...branding, logo_url: res.imageUrl });
        } catch (error) {
            console.error('Logo upload failed', error);
            alert('Failed to upload logo.');
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-muted-foreground">Loading branding settings...</div>;
    }

    if (!branding) {
        return <div className="p-8 text-rose-500">Failed to load branding settings.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <p className="text-muted-foreground text-sm">Configure how your shop looks on the mobile app.</p>
                <Button onClick={handleSave} disabled={saving} className="w-32">
                    {saving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Editor Panel */}
                <div className="space-y-6">
                    {/* General Settings */}
                    <Card className="p-6">
                        <h3 className="text-lg font-bold text-foreground mb-4 tracking-tight">App Details</h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-6 p-4 bg-muted/80 rounded-2xl border-2 border-dashed border-border">
                                <div className="w-20 h-20 rounded-2xl bg-card shadow-sm border border-border overflow-hidden flex items-center justify-center">
                                    {branding.logo_url ? (
                                        <img src={getFullImageUrl(branding.logo_url)} alt="Logo Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-2xl">🏪</span>
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <p className="text-sm font-bold text-foreground">Shop Logo</p>
                                    <p className="text-xs text-muted-foreground">Upload a square image (PNG/JPG, max 2MB).</p>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleLogoUpload}
                                        className="hidden"
                                        accept="image/*"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={uploading}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {uploading ? 'Uploading...' : 'Upload New Logo'}
                                    </Button>
                                </div>
                            </div>

                            <Input
                                label="Logo URL (Direct Link)"
                                placeholder="https://example.com/logo.png"
                                value={branding.logo_url || ''}
                                onChange={e => setBranding({ ...branding, logo_url: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">You can either upload a logo or provide a direct URL.</p>
                        </div>
                    </Card>

                    {/* Color Theme */}
                    <Card className="p-6">
                        <h3 className="text-lg font-bold text-foreground mb-4 tracking-tight">Color Theme</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Primary Color</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={branding.primary_color}
                                        onChange={e => setBranding({ ...branding, primary_color: e.target.value })}
                                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                    />
                                    <Input
                                        value={branding.primary_color}
                                        onChange={e => setBranding({ ...branding, primary_color: e.target.value })}
                                        className="uppercase font-mono text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Secondary Color</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={branding.secondary_color}
                                        onChange={e => setBranding({ ...branding, secondary_color: e.target.value })}
                                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                    />
                                    <Input
                                        value={branding.secondary_color}
                                        onChange={e => setBranding({ ...branding, secondary_color: e.target.value })}
                                        className="uppercase font-mono text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Accent Color</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={branding.accent_color}
                                        onChange={e => setBranding({ ...branding, accent_color: e.target.value })}
                                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                    />
                                    <Input
                                        value={branding.accent_color}
                                        onChange={e => setBranding({ ...branding, accent_color: e.target.value })}
                                        className="uppercase font-mono text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Theme Mode</label>
                                <select
                                    className="w-full h-11 px-4 bg-muted/80 border-2 border-border rounded-xl text-sm font-bold text-foreground outline-none focus:border-indigo-500 transition-all appearance-none"
                                    value={branding.theme_mode}
                                    onChange={e => setBranding({ ...branding, theme_mode: e.target.value })}
                                >
                                    <option value="light">Light Mode</option>
                                    <option value="dark">Dark Mode</option>
                                    <option value="auto">Auto (System Default)</option>
                                </select>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Preview Panel */}
                <div>
                    <Card className="p-6 bg-muted sticky top-6">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Live App Preview</h3>

                        <div className="w-[320px] h-[640px] border-8 border-slate-800 rounded-[2.5rem] overflow-hidden mx-auto bg-card shadow-2xl relative flex flex-col"
                            style={{ backgroundColor: branding.theme_mode === 'dark' ? '#1e293b' : '#f8fafc' }}
                        >
                            {/* App Header */}
                            <div className="pt-12 pb-4 px-6 flex justify-between items-center shadow-sm z-10"
                                style={{ backgroundColor: branding.theme_mode === 'dark' ? '#0f172a' : 'white' }}>
                                <div className="flex items-center gap-3">
                                    {branding.logo_url ? (
                                        <img src={getFullImageUrl(branding.logo_url)} alt="Logo" className="w-8 h-8 rounded object-cover" />
                                    ) : (
                                        <div className="w-8 h-8 rounded flex items-center justify-center text-white font-bold"
                                            style={{ backgroundColor: branding.primary_color }}>
                                            MS
                                        </div>
                                    )}
                                    <span className="font-bold text-lg tracking-tight"
                                        style={{ color: branding.theme_mode === 'dark' ? 'white' : '#1e293b' }}>
                                        MyShop
                                    </span>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                    style={{ backgroundColor: branding.secondary_color }}>
                                    <span className="text-xs font-bold">JD</span>
                                </div>
                            </div>

                            {/* App Content */}
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                                {/* Banner */}
                                <div className="rounded-2xl p-6 text-white text-center shadow-lg relative overflow-hidden"
                                    style={{ background: `linear-gradient(135deg, ${branding.primary_color}, ${branding.secondary_color})` }}>
                                    <h2 className="text-2xl font-semibold mb-1 relative z-10">Welcome Back!</h2>
                                    <p className="text-white/80 text-sm font-medium relative z-10">Ready to shop today?</p>
                                </div>

                                {/* Categories */}
                                <div className="space-y-3">
                                    <h3 className="font-bold text-sm" style={{ color: branding.theme_mode === 'dark' ? 'white' : '#475569' }}>Categories</h3>
                                    <div className="flex gap-3 overflow-x-hidden">
                                        {['Groceries', 'Snacks', 'Drinks'].map((cat, i) => (
                                            <div key={i} className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shadow-sm border border-border"
                                                style={{
                                                    backgroundColor: i === 0 ? branding.primary_color : (branding.theme_mode === 'dark' ? '#334155' : 'white'),
                                                    color: i === 0 ? 'white' : (branding.theme_mode === 'dark' ? 'white' : '#475569'),
                                                    borderColor: branding.theme_mode === 'dark' ? '#334155' : '#e2e8f0'
                                                }}>
                                                {cat}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Product List */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-sm" style={{ color: branding.theme_mode === 'dark' ? 'white' : '#475569' }}>Popular Items</h3>
                                    {[1, 2].map(i => (
                                        <div key={i} className="flex gap-4 p-3 rounded-xl shadow-sm border border-border items-center"
                                            style={{
                                                backgroundColor: branding.theme_mode === 'dark' ? '#1e293b' : 'white',
                                                borderColor: branding.theme_mode === 'dark' ? '#334155' : '#f1f5f9'
                                            }}>
                                            <div className="w-16 h-16 rounded-lg bg-slate-200" style={{ backgroundColor: branding.theme_mode === 'dark' ? '#334155' : '#e2e8f0' }} />
                                            <div className="flex-1">
                                                <div className="h-4 w-24 rounded mb-2" style={{ backgroundColor: branding.theme_mode === 'dark' ? '#475569' : '#cbd5e1' }}></div>
                                                <div className="h-3 w-16 rounded" style={{ backgroundColor: branding.theme_mode === 'dark' ? '#334155' : '#e2e8f0' }}></div>
                                            </div>
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold"
                                                style={{ backgroundColor: branding.accent_color }}>
                                                +
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Bottom Nav */}
                            <div className="h-16 flex justify-around items-center border-t border-border"
                                style={{
                                    backgroundColor: branding.theme_mode === 'dark' ? '#0f172a' : 'white',
                                    borderColor: branding.theme_mode === 'dark' ? '#1e293b' : '#f1f5f9'
                                }}>
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="w-6 h-6 rounded-md"
                                        style={{ backgroundColor: i === 1 ? branding.primary_color : (branding.theme_mode === 'dark' ? '#334155' : '#cbd5e1') }} />
                                ))}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
