import React, { useState, useCallback, useEffect } from 'react';
import { shopApi, ShopVendor } from '../../../services/shopApi';
import { useAppContext } from '../../../context/AppContext';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';

function toState(v: ShopVendor): Record<string, any> {
  return {
    id: v.id,
    name: v.name,
    companyName: v.company_name,
    company_name: v.company_name,
    contactNo: v.contact_no,
    contact_no: v.contact_no,
    email: v.email,
    address: v.address,
    description: v.description,
  };
}

export interface AddVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the created vendor (API shape) after successful create. Use to refresh lists and set selection. */
  onSaved?: (vendor: ShopVendor) => void;
  /** Optional initial name to pre-fill (e.g. from search text). */
  initialName?: string;
}

const defaultForm = {
  name: '',
  company_name: '',
  contact_no: '',
  email: '',
  address: '',
  description: '',
};

export default function AddVendorModal({ isOpen, onClose, onSaved, initialName = '' }: AddVendorModalProps) {
  const { dispatch } = useAppContext();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({
        ...defaultForm,
        name: initialName.trim(),
      });
    }
  }, [isOpen, initialName]);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const created = await shopApi.createVendor(form);
      dispatch({ type: 'ADD_VENDOR', payload: toState(created) });
      onSaved?.(created);
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Failed to create vendor');
    } finally {
      setSaving(false);
    }
  }, [form, dispatch, onSaved, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Vendor" size="lg">
      <div className="space-y-4">
        <Input
          label="Vendor Name"
          placeholder="Contact or business name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="Company Name"
          placeholder="Optional"
          value={form.company_name}
          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Contact No"
            placeholder="Phone"
            value={form.contact_no}
            onChange={(e) => setForm((f) => ({ ...f, contact_no: e.target.value }))}
          />
          <Input
            label="Email"
            placeholder="Optional"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <Input
          label="Address"
          placeholder="Optional"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <Input
          label="Description / Notes"
          placeholder="Optional"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim() || saving}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
