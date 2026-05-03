import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { Plus, Pencil, Trash2, Search, ChefHat, X, Tags } from 'lucide-react';

type RecipeRow = {
  id: string;
  title: string;
  image_url?: string | null;
  is_active: boolean;
  category_id?: string | null;
  category_name?: string | null;
  updated_at?: string;
};

type RecipeCategory = {
  id: string;
  name: string;
  image_url?: string | null;
};

function thumbUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = import.meta.env.VITE_API_URL as string | undefined;
  const origin = base ? base.replace(/\/?api\/?$/i, '').replace(/\/$/, '') : '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}

function categoryLabel(row: RecipeRow, cats: RecipeCategory[]): string {
  const fromJoin = row.category_name?.trim();
  if (fromJoin) return fromJoin;
  if (row.category_id) {
    const hit = cats.find((c) => c.id === row.category_id);
    if (hit?.name?.trim()) return hit.name.trim();
  }
  return '—';
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
  const [cats, setCats] = useState<RecipeCategory[]>([]);

  const [categoryModal, setCategoryModal] = useState<null | 'new' | 'manage'>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatImageUrl, setNewCatImageUrl] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  const loadCategories = useCallback(async () => {
    const c = await shopApi.getRecipeCategories();
    setCats(Array.isArray(c) ? c : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [_, r] = await Promise.all([
        loadCategories(),
        shopApi.getRecipes({
          search: search.trim() || undefined,
          category_id: categoryId || undefined,
          is_active: activeFilter === 'all' ? undefined : activeFilter === 'active' ? 'true' : 'false',
          limit: pageSize,
          offset: page * pageSize,
        }),
      ]);
      const data = r as { items?: RecipeRow[]; total?: number };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, activeFilter, page, loadCategories]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (categoryModal === 'manage') void loadCategories();
  }, [categoryModal, loadCategories]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const toggle = async (row: RecipeRow) => {
    setErr('');
    try {
      const full = await shopApi.getRecipe(row.id);
      const r = full.recipe || {};
      const payload = {
        title: r.title,
        description: r.description ?? null,
        image_url: r.image_url ?? null,
        video_url: r.video_url ?? null,
        prep_time_minutes: r.prep_time_minutes ?? 0,
        cook_time_minutes: r.cook_time_minutes ?? 0,
        servings: r.servings ?? 1,
        difficulty: r.difficulty ?? null,
        cuisine: r.cuisine ?? null,
        calories: r.calories ?? null,
        category_id: r.category_id ?? null,
        is_active: !row.is_active,
        is_featured: !!r.is_featured,
        is_quick_meal: !!r.is_quick_meal,
        is_budget_meal: !!r.is_budget_meal,
        is_trending: !!r.is_trending,
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
      await shopApi.updateRecipe(row.id, payload);
      setItems((prev) =>
        prev.map((x) =>
          x.id === row.id
            ? {
                ...x,
                is_active: !row.is_active,
                category_name: r.category_name ?? x.category_name,
                category_id: r.category_id ?? x.category_id,
              }
            : x
        )
      );
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

  const submitNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    setCatSaving(true);
    setErr('');
    try {
      await shopApi.createRecipeCategory({
        name,
        image_url: newCatImageUrl.trim() || null,
      });
      setNewCatName('');
      setNewCatImageUrl('');
      setCategoryModal(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Could not create category');
    } finally {
      setCatSaving(false);
    }
  };

  const startRenameCategory = (c: RecipeCategory) => {
    setEditCatId(c.id);
    setEditCatName(c.name);
  };

  const saveRenameCategory = async () => {
    if (!editCatId) return;
    const name = editCatName.trim();
    if (!name) return;
    setCatSaving(true);
    setErr('');
    try {
      await shopApi.updateRecipeCategory(editCatId, { name });
      setEditCatId(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Could not rename category');
    } finally {
      setCatSaving(false);
    }
  };

  const deleteCategory = async (c: RecipeCategory) => {
    if (!confirm(`Delete category “${c.name}”? Recipes in this category will have no category.`)) return;
    setErr('');
    try {
      await shopApi.deleteRecipeCategory(c.id);
      if (categoryId === c.id) setCategoryId('');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Could not delete category');
    }
  };

  const filterLabel = useMemo(() => {
    if (activeFilter === 'active') return 'Active';
    if (activeFilter === 'inactive') return 'Inactive';
    return 'All';
  }, [activeFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChefHat className="h-7 w-7 text-violet-600" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recipes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure recipes and product mappings for the mobile app.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setNewCatName('');
              setNewCatImageUrl('');
              setCategoryModal('new');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            New category
          </button>
          <button
            type="button"
            onClick={() => setCategoryModal('manage')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <Tags className="h-4 w-4" />
            Manage categories
          </button>
          <button
            type="button"
            onClick={() => navigate('/recipes/new')}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" /> New recipe
          </button>
        </div>
      </div>

      {categoryModal === 'new' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-cat-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="new-cat-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                New recipe category
              </h2>
              <button
                type="button"
                onClick={() => setCategoryModal(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void submitNewCategory(e)} className="space-y-3">
              <div>
                <label htmlFor="new-cat-name" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Name *
                </label>
                <input
                  id="new-cat-name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  placeholder="e.g. Main course, Desserts"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="new-cat-img" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Image URL (optional)
                </label>
                <input
                  id="new-cat-img"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  placeholder="https://… or /uploads/…"
                  value={newCatImageUrl}
                  onChange={(e) => setNewCatImageUrl(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCategoryModal(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catSaving || !newCatName.trim()}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {catSaving ? 'Saving…' : 'Create category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {categoryModal === 'manage' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-cat-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 id="manage-cat-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Recipe categories
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditCatId(null);
                  setCategoryModal(null);
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-4">
              {cats.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No categories yet. Create one with “New category”.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-slate-900">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="w-[120px] pb-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-2">
                          {editCatId === c.id ? (
                            <input
                              className="w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                              value={editCatName}
                              onChange={(e) => setEditCatName(e.target.value)}
                              autoFocus
                            />
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {editCatId === c.id ? (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                disabled={catSaving}
                                onClick={() => void saveRenameCategory()}
                                className="rounded px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditCatId(null)}
                                className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => startRenameCategory(c)}
                                className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Rename"
                                aria-label={`Rename ${c.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteCategory(c)}
                                className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                title="Delete"
                                aria-label={`Delete ${c.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

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
                  <td className="p-3 text-slate-600 dark:text-slate-400">{categoryLabel(row, cats)}</td>
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
