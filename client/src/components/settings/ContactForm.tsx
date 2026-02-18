import React from 'react';

export default function ContactForm({ onSave, onCancel, onSubmit, isVendorForm, existingVendors }: {
  onSave?: (data: any) => void;
  onCancel?: () => void;
  onSubmit?: (data: any) => void;
  isVendorForm?: boolean;
  existingVendors?: any;
}) {
  return (
    <div className="p-4 text-gray-500 text-center">
      <p>Contact form placeholder - implement as needed</p>
    </div>
  );
}
