import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { Plus, Pencil, Trash2, Search, ChefHat } from 'lucide-react';

type RecipeRow = {
  id: string;
  title: string;
  image_url?: string | null;
  is_active: boolean;
  category_id?: string | null;
  category_name?: string | null;
  updated_at?: string;
};

function thumbUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = import.meta.env.VITE_API_URL as string | undefined;
  const origin = base ? base.replace(/\/?api\/?$/i, '').replace(/\/$/, '') : '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}

export default function RecipesListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecipeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 15;
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [c, r] = await Promise.all([
        shopApi.getRecipeCategories(),
        shopApi.getRecipes({
          search: search.trim() || undefined,
          category_id: categoryId || undefined,
          is_active: activeFilter === 'all' ? undefined : activeFilter === 'active' ? 'true' : 'false',
          limit: pageSize,
          offset: page * pageSize,
        }),
      ]);
      setCats(Array.isArray(c) ? c : []);
      const data = r as { items?: RecipeRow[]; total?: number };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, activeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const toggle = async (row: RecipeRow) => {
    setErr('');
    try {
      const full = await shopApi.getRecipe(row.id);
      const payload = {
        ...full.recipe,
        ingredients: (full.ingredients || []).map((x: any) => ({
          ingredient_name: x.ingredient_name,
          quantity: Number(x.quantity),
          unit: x.unit || '',
          optional: !!x.optional,
          product_id: x.product_id,
        })),
        steps: (full.steps || []).map((x: any) => ({
          step_number: x.step_number,
          instruction: x.instruction,
          image_url: x.image_url,
        })),
      };
      await shopApi.updateRecipe(row.id, { ...payload, is_active: !row.is_active });
      setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (e: any) {
      setErr(e?.message || 'Could not update');
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this recipe?')) return;
    setErr('');
    try {
      await shopApi.deleteRecipe(id);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Delete failed');
    }
  };

  const filterLabel = useMemo(() => {
    if (activeFilter === 'active') return 'Active';
    if (activeFilter === 'inactive') return 'Inactive';
    return 'All';
  }, [activeFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChefHat className="h-7 w-7 text-violet-600" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recipes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Configure recipes and product mappings for the mobile app.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/recipes/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" /> New recipe
        </button>
        <button
          type="button"
          onClick={async () => {
            const name = window.prompt('New recipe category name');
            if (!name?.trim()) return;
            setErr('');
            try {
              await shopApi.createRecipeCategory({ name: name.trim() });
              const c = await shopApi.getRecipeCategories();
              setCats(Array.isArray(c) ? c : []);
            } catch (e: any) {
              setErr(e?.message || 'Could not create category');
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          New category
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm dark:border-slate-600 dark:bg-slate-950"
              placeholder="Title or cuisine..."
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={categoryId}
            onChange={(e) => {
              setPage(0);
              setCategoryId(e.target.value);
            }}
          >
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={activeFilter}
            onChange={(e) => {
              setPage(0);
              setActiveFilter(e.target.value as 'all' | 'active' | 'inactive');
            }}
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No recipes yet. Create one for your mobile customers.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
              <tr>
                <th className="p-3 font-medium">Image</th>
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Updated</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2">
                    {row.image_url ? (
                      <img
                        src={thumbUrl(row.image_url) || ''}
                        alt=""
                        className="h-12 w-12 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800">
                        <ChefHat className="h-6 w-6 text-slate-400" />
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-medium">{row.title}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{row.category_name || '—'}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => toggle(row)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_active
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {row.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-3 text-slate-500">
                    {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/recipes/${row.id}`)}
                      className="mr-2 inline-flex rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => del(row.id)}
                      className="inline-flex rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>
          {total} recipe{total === 1 ? '' : 's'} · {filterLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
          >
            Prev
          </button>
          <span>
            Page {page + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
