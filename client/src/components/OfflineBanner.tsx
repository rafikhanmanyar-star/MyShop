import React from 'react';
import { useOnline } from '../hooks/useOnline';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const isOnline = useOnline();
  if (isOnline) return null;
  return (
    <div className="px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      Offline — Data will sync when connection is restored.
    </div>
  );
}
