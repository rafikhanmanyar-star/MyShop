import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../../../context/AppContext';
import { shopApi, type ShopVendor } from '../../../services/shopApi';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';

const VENDOR_PAGE_SIZE = 10;

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getVendorInitials(name: string): string {
  return getInitials(name);
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

/**
 * Vendor directory — same capabilities as the former Settings → Vendor Management tab.
 * Lives under Procurement so buyers manage suppliers next to purchase workflows.
 */
export default function VendorDirectorySection() {
  const { dispatch } = useAppContext();
  const [vendors, setVendors] = useState<ShopVendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<ShopVendor | null>(null);
  const [vendorForm, setVendorForm] = useState({
    name: '',
    company_name: '',
    contact_no: '',
    email: '',
    address: '',
    description: '',
  });

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

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

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
      description: v.description || '',
    });
    setIsVendorModalOpen(true);
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
      void loadVendors();
    } catch (e: any) {
      alert(e?.message || 'Failed to save vendor');
    }
  };

  const handleDeactivateVendor = async (id: string) => {
    if (!confirm('Deactivate this vendor? They will no longer appear in Procurement.')) return;
    try {
      await shopApi.deleteVendor(id);
      void loadVendors();
    } catch (e: any) {
      alert(e?.message || 'Failed to deactivate');
    }
  };

  const handleActivateVendor = async (id: string) => {
    try {
      await shopApi.updateVendor(id, { is_active: true });
      void loadVendors();
    } catch (e: any) {
      alert(e?.message || 'Failed to activate vendor');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'last_active' | 'name' | 'company'>('last_active');
  const [currentPage, setCurrentPage] = useState(1);

  const activeCount = useMemo(() => vendors.filter((v) => v.is_active).length, [vendors]);
  const inactiveCount = useMemo(() => vendors.filter((v) => !v.is_active).length, [vendors]);

  const filteredVendors = useMemo(() => {
    let result = [...vendors];
    if (statusFilter === 'active') result = result.filter((v) => v.is_active);
    else if (statusFilter === 'inactive') result = result.filter((v) => !v.is_active);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.company_name && v.company_name.toLowerCase().includes(q)) ||
          (v.email && v.email.toLowerCase().includes(q)) ||
          (v.contact_no && v.contact_no.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'company') return (a.company_name || '').localeCompare(b.company_name || '');
      const aDate = a.updated_at || a.created_at || '';
      const bDate = b.updated_at || b.created_at || '';
      return bDate.localeCompare(aDate);
    });

    return result;
  }, [vendors, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / VENDOR_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedVendors = filteredVendors.slice((safePage - 1) * VENDOR_PAGE_SIZE, safePage * VENDOR_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const filterButtons: { key: typeof statusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Vendor directory</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
              {vendors.length} Vendors
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Manage suppliers used in procurement and stock operations</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-border bg-card px-4 py-2 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active</div>
              <div className="text-xl font-bold text-foreground">{activeCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-2 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inactive</div>
              <div className="text-xl font-bold text-foreground">{inactiveCount}</div>
            </div>
          </div>
          <Button onClick={openNewVendor} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700">
            {ICONS.plus} Add vendor
          </Button>
        </div>
      </div>

      <Card className="border-none p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, company, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full py-2 pl-10 pr-3 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {filterButtons.map((fb) => (
              <button
                key={fb.key}
                type="button"
                onClick={() => setStatusFilter(fb.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === fb.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {fb.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="input rounded-md py-1.5 pl-2 pr-7 text-xs"
              aria-label="Sort vendors"
            >
              <option value="last_active">Sort by: Last Active</option>
              <option value="name">Sort by: Name</option>
              <option value="company">Sort by: Company</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border-none shadow-sm">
        {vendorsLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Vendor Name</th>
                  <th className="px-6 py-3">Company</th>
                  <th className="px-6 py-3">Contact</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedVendors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      {searchQuery || statusFilter !== 'all'
                        ? 'No vendors match your filters.'
                        : 'No vendors yet. Create one to use in Procurement.'}
                    </td>
                  </tr>
                ) : (
                  pagedVendors.map((v) => {
                    const shortId = v.id.length > 8 ? v.id.slice(0, 8).toUpperCase() : v.id.toUpperCase();
                    return (
                      <tr key={v.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(v.id)}`}
                            >
                              {getVendorInitials(v.name)}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{v.name}</div>
                              <div className="text-[11px] text-muted-foreground">ID: VEN-{shortId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{v.company_name || '—'}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{v.contact_no || '—'}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{v.email || '—'}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                              v.is_active
                                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                                : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                            }`}
                          >
                            {v.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            {v.is_active ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditVendor(v)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                                  title="Edit"
                                >
                                  {React.cloneElement(ICONS.edit as React.ReactElement<{ width?: number; height?: number }>, {
                                    width: 16,
                                    height: 16,
                                  })}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeactivateVendor(v.id)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-500"
                                  title="Deactivate"
                                >
                                  {React.cloneElement(ICONS.trash as React.ReactElement<{ width?: number; height?: number }>, {
                                    width: 16,
                                    height: 16,
                                  })}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleActivateVendor(v.id)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                                  title="Activate"
                                >
                                  {React.cloneElement(ICONS.checkCircle as React.ReactElement<{ width?: number; height?: number }>, {
                                    width: 16,
                                    height: 16,
                                  })}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditVendor(v)}
                                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                                  title="Edit"
                                >
                                  {React.cloneElement(ICONS.edit as React.ReactElement<{ width?: number; height?: number }>, {
                                    width: 16,
                                    height: 16,
                                  })}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {!vendorsLoading && filteredVendors.length > VENDOR_PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3 text-sm">
            <span className="text-xs text-muted-foreground">
              Showing {(safePage - 1) * VENDOR_PAGE_SIZE + 1} to {Math.min(safePage * VENDOR_PAGE_SIZE, filteredVendors.length)}{' '}
              of {filteredVendors.length} results
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (safePage <= 3) {
                  pageNum = i + 1;
                } else if (safePage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = safePage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 min-w-[32px] rounded-md text-xs font-semibold transition-colors ${
                      safePage === pageNum ? 'bg-primary-600 text-white' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      <Modal isOpen={isVendorModalOpen} onClose={() => setIsVendorModalOpen(false)} title={editingVendor ? 'Edit Vendor' : 'New Vendor'} size="lg">
        <div className="space-y-4">
          <Input
            label="Vendor Name"
            placeholder="Contact or business name"
            value={vendorForm.name}
            onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
          />
          <Input
            label="Company Name"
            placeholder="Optional"
            value={vendorForm.company_name}
            onChange={(e) => setVendorForm({ ...vendorForm, company_name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Contact No"
              placeholder="Phone"
              value={vendorForm.contact_no}
              onChange={(e) => setVendorForm({ ...vendorForm, contact_no: e.target.value })}
            />
            <Input
              label="Email"
              placeholder="Optional"
              value={vendorForm.email}
              onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
            />
          </div>
          <Input
            label="Address"
            placeholder="Optional"
            value={vendorForm.address}
            onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
          />
          <Input
            label="Description / Notes"
            placeholder="Optional — shown as a label on purchase bill vendor column"
            value={vendorForm.description}
            onChange={(e) => setVendorForm({ ...vendorForm, description: e.target.value })}
          />
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsVendorModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveVendor()} disabled={!vendorForm.name.trim()}>
              {editingVendor ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
