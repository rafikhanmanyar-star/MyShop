import React, { useState, useEffect, useCallback } from 'react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import { dataApi, BackupEntry } from '../../../services/shopApi';
import { Database, Plus, RotateCcw, AlertTriangle } from 'lucide-react';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupRestoreSection() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<BackupEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dataApi.backups.list();
      setBackups(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load backups');
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async () => {
    setCreating(true);
    setError(null);
    try {
      await dataApi.backups.create();
      await loadBackups();
    } catch (e: any) {
      setError(e?.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (entry: BackupEntry) => {
    setRestoring(entry.filename);
    setError(null);
    try {
      await dataApi.backups.restore(entry.filename);
      setRestoreConfirm(null);
      alert('Database restored successfully. Refreshing the page is recommended.');
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || 'Failed to restore backup');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <Card className="border-none shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-2">Backup and restore</h3>
        <p className="text-slate-600 text-sm mb-4">
          Create a full database backup. Restore overwrites all current data with the selected backup—no merging.
        </p>
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Button
            onClick={handleCreateBackup}
            disabled={creating || loading}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating backup…' : 'Create backup'}
          </Button>
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading backups…</div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
              <Database className="w-10 h-10 text-slate-300" />
              No backups yet. Create one to restore later.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatSize(entry.sizeInBytes)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRestoreConfirm(entry)}
                        disabled={!!restoring}
                        className="flex items-center gap-1 ml-auto border-amber-200 text-amber-700 hover:bg-amber-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Modal
        isOpen={!!restoreConfirm}
        onClose={() => !restoring && setRestoreConfirm(null)}
        title="Restore this backup?"
        size="md"
      >
        {restoreConfirm && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800">This will overwrite all current data.</p>
                <p className="text-sm text-amber-700 mt-1">
                  The entire database will be replaced with the backup from{' '}
                  <strong>{formatDate(restoreConfirm.createdAt)}</strong>. Nothing will be merged. Make sure you have a recent backup if you might need current data.
                </p>
              </div>
            </div>
            <p className="text-slate-600 text-sm">
              Backup: <span className="font-mono text-slate-800">{restoreConfirm.filename}</span>
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setRestoreConfirm(null)} disabled={!!restoring}>
                Cancel
              </Button>
              <Button
                onClick={() => handleRestore(restoreConfirm)}
                disabled={!!restoring}
                className="bg-amber-600 hover:bg-amber-700 border-amber-600"
              >
                {restoring === restoreConfirm.filename ? 'Restoring…' : 'Restore now'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
