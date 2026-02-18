import React from 'react';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <Construction className="w-12 h-12 mb-4" />
      <h2 className="text-xl font-semibold text-gray-600">{title}</h2>
      <p className="text-sm mt-2">This section will be available once you copy the components from PBooksPro.</p>
    </div>
  );
}
