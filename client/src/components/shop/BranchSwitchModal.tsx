import React, { useState } from 'react';
import { Building2, WifiOff } from 'lucide-react';
import { useBranch } from '../../context/BranchContext';

export default function BranchSwitchModal() {
  const { branches, selectedBranchId, setBranch, isSwitchModalOpen, setSwitchModalOpen } = useBranch();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  const handleSelect = (branchId: string) => {
    if (branchId === selectedBranchId) {
      setSwitchModalOpen(false);
      return;
    }
    if (isOffline) return;
    setConfirmingId(branchId);
  };

  const handleConfirm = () => {
    if (confirmingId) {
      setBranch(confirmingId);
      setConfirmingId(null);
    }
  };

  if (!isSwitchModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSwitchModalOpen(false)}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Switch Branch</h2>
          <p className="text-sm text-gray-500 mt-0.5">Select a branch within your organization</p>
        </div>

        {isOffline && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-sm">
            <WifiOff className="w-5 h-5 flex-shrink-0" />
            <span>Internet required to switch branch.</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              disabled={isOffline}
              onClick={() => handleSelect(branch.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                branch.id === selectedBranchId
                  ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-900'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100 text-gray-800'
              } ${isOffline ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Building2 className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{branch.name}</p>
                {branch.code && <p className="text-xs text-gray-500">{branch.code}</p>}
              </div>
              {branch.id === selectedBranchId && (
                <span className="text-xs font-semibold text-indigo-600">Current</span>
              )}
            </button>
          ))}
        </div>

        {confirmingId && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingId(null)}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
            >
              Confirm switch
            </button>
          </div>
        )}

        <div className="p-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setSwitchModalOpen(false)}
            className="w-full py-2 text-gray-600 font-medium rounded-lg hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
