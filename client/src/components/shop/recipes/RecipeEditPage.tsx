import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { ArrowLeft, Plus, Trash2, GripVertical, Upload, ChefHat } from 'lucide-react';

type IngDraft = {
  key: string;
  ingredient_name: string;
  quantity: string;
  unit: string;
  optional: boolean;
  product_id: string;
};

type StepDraft = {
  key: string;
  instruction: string;
  image_url: string;
};

type ProductOpt = { id: string; name: string; sku: string };

function genKey() {
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function RecipeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [prodSearch, setProdSearch] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [prep, setPrep] = useState('0');
  const [cook, setCook] = useState('0');
  const [servings, setServings] = useState('1');
  const [difficulty, setDifficulty] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [calories, setCalories] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isQuick, setIsQuick] = useState(false);
  const [isBudget, setIsBudget] = useState(false);
  const [isTrending, setIsTrending] = useState(false);

  const [ingredients, setIngredients] = useState<IngDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);

  const [dragStep, setDragStep] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 80);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 80);
  }, [products, prodSearch]);

  const loadBase = useCallback(async () => {
    const [c, p] = await Promise.all([shopApi.getRecipeCategories(), shopApi.getProducts()]);
    setCats(Array.isArray(c) ? c : []);
    setProducts(Array.isArray(p) ? p.map((x: any) => ({ id: x.id, name: x.name, sku: x.sku })) : []);
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      setIngredients([
        {
          key: genKey(),
          ingredient_name: '',
          quantity: '1',
          unit: '',
          optional: false,
          product_id: '',
        },
      ]);
      setSteps([{ key: genKey(), instruction: '', image_url: '' }]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const full = await shopApi.getRecipe(id!);
        if (cancelled) return;
        const r = full.recipe;
        setTitle(r.title || '');
        setDescription(r.description || '');
        setImageUrl(r.image_url || '');
        setVideoUrl(r.video_url || '');
        setPrep(String(r.prep_time_minutes ?? 0));
        setCook(String(r.cook_time_minutes ?? 0));
        setServings(String(r.servings ?? 1));
        setDifficulty(r.difficulty || '');
        setCuisine(r.cuisine || '');
        setCalories(r.calories != null ? String(r.calories) : '');
        setCategoryId(r.category_id || '');
        setIsActive(!!r.is_active);
        setIsFeatured(!!r.is_featured);
        setIsQuick(!!r.is_quick_meal);
        setIsBudget(!!r.is_budget_meal);
        setIsTrending(!!r.is_trending);
        setIngredients(
          (full.ingredients || []).map((x: any) => ({
            key: genKey(),
            ingredient_name: x.ingredient_name || '',
            quantity: String(x.quantity ?? 1),
            unit: x.unit || '',
            optional: !!x.optional,
            product_id: x.product_id || '',
          }))
        );
        setSteps(
          (full.steps || []).map((x: any) => ({
            key: genKey(),
            instruction: x.instruction || '',
            image_url: x.image_url || '',
          }))
        );
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const uploadHero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { imageUrl: u } = await shopApi.uploadRecipeImage(f);
      setImageUrl(u);
    } catch (ex: any) {
      setErr(ex?.message || 'Upload failed');
    }
  };

  const addIng = () =>
    setIngredients((s) => [
      ...s,
      { key: genKey(), ingredient_name: '', quantity: '1', unit: '', optional: false, product_id: '' },
    ]);

  const removeIng = (key: string) => setIngredients((s) => s.filter((x) => x.key !== key));

  const patchIng = (key: string, patch: Partial<IngDraft>) =>
    setIngredients((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const addStep = () => setSteps((s) => [...s, { key: genKey(), instruction: '', image_url: '' }]);
  const removeStep = (key: string) => setSteps((s) => s.filter((x) => x.key !== key));
  const patchStep = (key: string, patch: Partial<StepDraft>) =>
    setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const reorderSteps = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setSteps((prev) => {
      const i = prev.findIndex((x) => x.key === fromKey);
      const j = prev.findIndex((x) => x.key === toKey);
      if (i < 0 || j < 0) return prev;
      const next = [...prev];
      const [row] = next.splice(i, 1);
      next.splice(j, 0, row);
      return next;
    });
  };

  const save = async () => {
    setErr('');
    const ingPayload = ingredients.map((x) => ({
      ingredient_name: x.ingredient_name.trim(),
      quantity: parseFloat(x.quantity) || 0,
      unit: x.unit.trim(),
      optional: x.optional,
      product_id: x.product_id,
    }));
    const stepPayload = steps.map((x, idx) => ({
      step_number: idx + 1,
      instruction: x.instruction.trim(),
      image_url: x.image_url.trim() || null,
    }));

    if (!title.trim()) {
      setErr('Title is required');
      return;
    }
    if (ingPayload.some((x) => !x.ingredient_name || !x.product_id)) {
      setErr('Each ingredient needs a name and linked product');
      return;
    }

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      video_url: videoUrl.trim() || null,
      prep_time_minutes: parseInt(prep, 10) || 0,
      cook_time_minutes: parseInt(cook, 10) || 0,
      servings: parseInt(servings, 10) || 1,
      difficulty: difficulty.trim() || null,
      cuisine: cuisine.trim() || null,
      calories: calories.trim() ? parseInt(calories, 10) : null,
      category_id: categoryId || null,
      is_active: isActive,
      is_featured: isFeatured,
      is_quick_meal: isQuick,
      is_budget_meal: isBudget,
      is_trending: isTrending,
      ingredients: ingPayload,
      steps: stepPayload,
    };

    setSaving(true);
    try {
      if (isNew) {
        await shopApi.createRecipe(body);
        navigate('/recipes');
      } else {
        await shopApi.updateRecipe(id!, body);
        navigate('/recipes');
      }
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-slate-500">
        Loading recipe…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/recipes"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <ChefHat className="h-6 w-6 text-violet-600" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isNew ? 'New recipe' : 'Edit recipe'}
        </h1>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <h2 className="font-medium text-slate-900 dark:text-slate-100">Basics</h2>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Title *</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
          <textarea
            className="min-h-[88px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Category</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">—</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Cuisine</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Prep (min)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={prep}
                onChange={(e) => setPrep(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Cook (min)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={cook}
                onChange={(e) => setCook(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Servings</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Difficulty</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                placeholder="Easy, Medium…"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Calories</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Video URL</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Hero image</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                <Upload className="h-4 w-4" /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={uploadHero} />
              </label>
              {imageUrl && <span className="truncate text-xs text-slate-500">{imageUrl}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} /> Featured
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isQuick} onChange={(e) => setIsQuick(e.target.checked)} /> Quick meal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isBudget} onChange={(e) => setIsBudget(e.target.checked)} /> Budget meal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isTrending} onChange={(e) => setIsTrending(e.target.checked)} /> Trending
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Ingredients *</h2>
            <button
              type="button"
              onClick={addIng}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <p className="text-xs text-slate-500">Map each ingredient to a store product so carts can be generated.</p>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
            <label className="text-xs font-medium text-slate-600">Find product</label>
            <input
              className="flex-1 min-w-[180px] rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
              placeholder="Search by name or SKU…"
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            {ingredients.map((ing) => (
              <div
                key={ing.key}
                className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"
              >
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    className="rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                    placeholder="Ingredient name"
                    value={ing.ingredient_name}
                    onChange={(e) => patchIng(ing.key, { ingredient_name: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="w-20 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                      placeholder="Qty"
                      value={ing.quantity}
                      onChange={(e) => patchIng(ing.key, { quantity: e.target.value })}
                    />
                    <input
                      className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                      placeholder="Unit (cup, g, pcs)"
                      value={ing.unit}
                      onChange={(e) => patchIng(ing.key, { unit: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-600">Mapped product</label>
                  <select
                    className="min-w-[220px] flex-1 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={ing.product_id}
                    onChange={(e) => patchIng(ing.key, { product_id: e.target.value })}
                  >
                    <option value="">Select product…</option>
                    {filteredProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={ing.optional}
                      onChange={(e) => patchIng(ing.key, { optional: e.target.checked })}
                    />{' '}
                    Optional
                  </label>
                  <button
                    type="button"
                    onClick={() => removeIng(ing.key)}
                    className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    aria-label="Remove ingredient"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium text-slate-900 dark:text-slate-100">Steps</h2>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            <Plus className="h-3 w-3" /> Add step
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">Drag steps to reorder.</p>
        <div className="space-y-2">
          {steps.map((st, idx) => (
            <div
              key={st.key}
              draggable
              onDragStart={() => setDragStep(st.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragStep) reorderSteps(dragStep, st.key);
                setDragStep(null);
              }}
              className="flex gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800"
            >
              <div className="flex cursor-grab items-center text-slate-400">
                <GripVertical className="h-5 w-5" />
                <span className="ml-1 w-6 text-center text-xs font-semibold text-slate-500">{idx + 1}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <textarea
                  className="min-h-[64px] w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                  placeholder="Instruction"
                  value={st.instruction}
                  onChange={(e) => patchStep(st.key, { instruction: e.target.value })}
                />
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
                  placeholder="Step image URL (optional)"
                  value={st.image_url}
                  onChange={(e) => patchStep(st.key, { image_url: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeStep(st.key)}
                className="self-start rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pb-8">
        <button
          type="button"
          onClick={() => navigate('/recipes')}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-600"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isNew ? 'Create recipe' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
