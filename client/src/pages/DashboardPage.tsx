import React, { useEffect, useState } from 'react';
import { shopApi } from '../services/shopApi';
import { Package, ShoppingCart, TrendingUp, Users, AlertTriangle } from 'lucide-react';

interface DashboardStats {
  totalProducts: number;
  totalSales: number;
  totalRevenue: number;
  totalCustomers: number;
  lowStockItems: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0, totalSales: 0, totalRevenue: 0, totalCustomers: 0, lowStockItems: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [products, sales, loyaltyMembers, inventory] = await Promise.all([
          shopApi.getProducts().catch(() => []),
          shopApi.getSales().catch(() => []),
          shopApi.getLoyaltyMembers().catch(() => []),
          shopApi.getInventory().catch(() => []),
        ]);

        const totalRevenue = (sales as any[]).reduce((sum: number, s: any) => sum + parseFloat(s.grandTotal || s.grand_total || 0), 0);
        const lowStockItems = (inventory as any[]).filter((i: any) => parseFloat(i.quantity_on_hand) <= 10).length;

        setStats({
          totalProducts: (products as any[]).length,
          totalSales: (sales as any[]).length,
          totalRevenue,
          totalCustomers: (loyaltyMembers as any[]).length,
          lowStockItems,
        });
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = [
    { label: 'Products', value: stats.totalProducts, icon: Package, color: 'bg-blue-500' },
    { label: 'Total Sales', value: stats.totalSales, icon: ShoppingCart, color: 'bg-green-500' },
    { label: 'Revenue', value: `PKR ${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'bg-purple-500' },
    { label: 'Loyalty Members', value: stats.totalCustomers, icon: Users, color: 'bg-amber-500' },
    { label: 'Low Stock Items', value: stats.lowStockItems, icon: AlertTriangle, color: 'bg-red-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{card.label}</span>
              <div className={`${card.color} p-2 rounded-lg`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Getting Started</h2>
        <div className="space-y-3 text-sm text-gray-600">
          <p>1. Set up your <strong>Branches</strong> and <strong>Terminals</strong> in the Multi-Store section.</p>
          <p>2. Add your <strong>Products</strong> and manage <strong>Inventory</strong>.</p>
          <p>3. Start processing sales using the <strong>POS</strong>.</p>
          <p>4. Enroll customers in the <strong>Loyalty Program</strong> to track rewards.</p>
          <p>5. Configure your shop <strong>Policies</strong> (tax, pricing, approvals).</p>
        </div>
      </div>
    </div>
  );
}
