import React, { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { shopApi } from '../../../services/shopApi';
import { ArrowLeft, Plus, Trash2, GripVertical, Upload, ChefHat, Pencil, Search, ChevronDown } from 'lucide-react';
import { Table, TableHeaderRow, TableHead, TableBody, TableRow, TableCell } from '../../ui/Table';
import {
  clearRecipeDraft,
  readRecipeDraft,
  writeRecipeDraft,
  type RecipeEditDraftPayload,
} from './recipeEditDraftStorage';

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

const fieldSm =
  'h-8 w-full rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950';
const labelXs = 'text-[11px] font-medium leading-tight text-slate-600 dark:text-slate-400';

/** Per-row searchable product picker (native `<select>` is not keyboard-filterable). */
function RecipeIngredientProductCombo({
  products,
  value,
  onChange,
  buttonClassName,
  ariaLabel,
}: {
  products: ProductOpt[];
  value: string;
  onChange: (productId: string) => void;
  buttonClassName: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;

    const sync = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 8;
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom - pad;
      const spaceAbove = r.top - pad;
      const preferredCap = Math.min(window.innerHeight * 0.55, 384);
      const openBelow = spaceBelow >= 96 || spaceBelow >= spaceAbove;
      const maxPanelH = Math.min(
        Math.max(0, openBelow ? spaceBelow - gap : spaceAbove - gap),
        preferredCap
      );

      const next: React.CSSProperties = {
        position: 'fixed',
        left: Math.max(pad, Math.min(r.left, window.innerWidth - r.width - pad)),
        width: Math.min(Math.max(r.width, 220), window.innerWidth - pad * 2),
        maxHeight: maxPanelH,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
      };
      if (openBelow) {
        next.top = r.bottom + gap;
        next.bottom = 'auto';
      } else {
        next.top = 'auto';
        /** Anchor panel above the trigger (fixed from viewport bottom). */
        next.bottom = Math.max(pad, window.innerHeight - r.top + gap);
      }
      setPanelStyle(next);
    };

    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, close]);

  const selected = useMemo(() => products.find((p) => p.id === value), [products, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = !q
      ? products.slice(0, 120)
      : products
          .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
          .slice(0, 120);
    if (value && selected && !list.some((p) => p.id === value)) {
      list = [selected, ...list];
    }
    return list;
  }, [products, query, value, selected]);

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        style={panelStyle}
        className="min-h-0 overflow-hidden overscroll-contain rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900"
        aria-label={ariaLabel}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 p-1 dark:border-slate-800">
          <input
            type="search"
            className="h-8 w-full rounded border border-slate-200 px-2 text-xs dark:border-slate-600 dark:bg-slate-950"
            placeholder="Search name or SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
            }}
          />
        </div>
        <ul className="min-h-0 flex-1 list-none overflow-y-auto overflow-x-hidden overscroll-contain py-1 text-xs [touch-action:pan-y]">
          <li>
            <button
              type="button"
              className="w-full px-2.5 py-1.5 text-left text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                close();
              }}
            >
              Product…
            </button>
          </li>
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`w-full px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    value === p.id ? 'bg-violet-50 dark:bg-violet-950/50' : ''
                  }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(p.id);
                  close();
                }}
              >
                <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                <span className="block truncate text-[10px] text-slate-500">{p.sku}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && query.trim() ? (
            <li className="px-2.5 py-3 text-center text-[11px] text-slate-500">No matches</li>
          ) : null}
        </ul>
      </div>,
      document.body
    );

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${buttonClassName} flex w-full items-center justify-between gap-1 text-left`}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setQuery('');
          }
        }}
      >
        <span className={`min-w-0 flex-1 truncate ${!selected ? 'text-slate-400 dark:text-slate-500' : ''}`}>
          {selected ? `${selected.name} (${selected.sku})` : 'Product…'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
      </button>
      {panel}
    </div>
  );
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

  /** True after baseline load + optional draft restore; enables autosave + unmount flush */
  const [draftHydrated, setDraftHydrated] = useState(false);
  /** Server `updated_at` when this form was synced (edit flow); aligns draft snapshots with edits */
  const baselineUpdatedAtRef = useRef<string | null>(null);
  const draftHydratedRef = useRef(false);
  useEffect(() => {
    draftHydratedRef.current = draftHydrated;
  }, [draftHydrated]);

  /** Latest form snapshot for unmount persistence (excluding React keys) */
  type DraftSnap = Omit<RecipeEditDraftPayload, 'v' | 'savedAt' | 'recipeScope' | 'serverUpdatedAt'>;
  const snapshotRef = useRef<DraftSnap | null>(null);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const suppressPersistRef = useRef(false);

  const [dragStep, setDragStep] = useState<string | null>(null);
  const ingredientNameRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const filteredProducts = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 80);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 80);
  }, [products, prodSearch]);

  const quickAddProducts = useMemo(() => {
    if (!prodSearch.trim()) return [];
    return filteredProducts.slice(0, 10);
  }, [filteredProducts, prodSearch]);

  const loadBase = useCallback(async () => {
    const [c, p] = await Promise.all([shopApi.getRecipeCategories(), shopApi.getProducts()]);
    setCats(Array.isArray(c) ? c : []);
    setProducts(Array.isArray(p) ? p.map((x: any) => ({ id: x.id, name: x.name, sku: x.sku })) : []);
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const applyDraftPayload = useCallback((d: RecipeEditDraftPayload) => {
    setProdSearch(typeof d.prodSearch === 'string' ? d.prodSearch : '');
    setTitle(d.title || '');
    setDescription(d.description || '');
    setImageUrl(d.imageUrl || '');
    setVideoUrl(d.videoUrl || '');
    setPrep(typeof d.prep === 'string' ? d.prep : '0');
    setCook(typeof d.cook === 'string' ? d.cook : '0');
    setServings(typeof d.servings === 'string' ? d.servings : '1');
    setDifficulty(d.difficulty || '');
    setCuisine(d.cuisine || '');
    setCalories(typeof d.calories === 'string' ? d.calories : '');
    setCategoryId(d.categoryId || '');
    setIsActive(!!d.isActive);
    setIsFeatured(!!d.isFeatured);
    setIsQuick(!!d.isQuick);
    setIsBudget(!!d.isBudget);
    setIsTrending(!!d.isTrending);
    setIngredients(
      (d.ingredients || []).map((x) => ({
        key: genKey(),
        ingredient_name: x.ingredient_name || '',
        quantity: typeof x.quantity === 'string' ? x.quantity : '1',
        unit: typeof x.unit === 'string' ? x.unit : '',
        optional: !!x.optional,
        product_id: typeof x.product_id === 'string' ? x.product_id : '',
      }))
    );
    const st = Array.isArray(d.steps) && d.steps.length ? d.steps : [{ instruction: '', image_url: '' }];
    setSteps(
      st.map((x) => ({
        key: genKey(),
        instruction: typeof x.instruction === 'string' ? x.instruction : '',
        image_url: typeof x.image_url === 'string' ? x.image_url : '',
      }))
    );
  }, []);

  const applyServerRecipe = useCallback((full: any) => {
    const r = full.recipe;
    baselineUpdatedAtRef.current = r?.updated_at != null ? String(r.updated_at) : null;
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
    setProdSearch('');
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
      (full.steps || []).length > 0
        ? (full.steps || []).map((x: any) => ({
            key: genKey(),
            instruction: x.instruction || '',
            image_url: x.image_url || '',
          }))
        : [{ key: genKey(), instruction: '', image_url: '' }]
    );
  }, []);

  useEffect(() => {
    suppressPersistRef.current = false;
    setDraftHydrated(false);
    ingredientNameRefs.current = {};
    baselineUpdatedAtRef.current = null;

    if (isNew) {
      setErr('');
      setLoading(false);
      const d = readRecipeDraft('new');
      if (d && d.recipeScope === 'new') {
        applyDraftPayload(d);
      } else {
        setProdSearch('');
        setTitle('');
        setDescription('');
        setImageUrl('');
        setVideoUrl('');
        setPrep('0');
        setCook('0');
        setServings('1');
        setDifficulty('');
        setCuisine('');
        setCalories('');
        setCategoryId('');
        setIsActive(true);
        setIsFeatured(false);
        setIsQuick(false);
        setIsBudget(false);
        setIsTrending(false);
        setIngredients([]);
        setSteps([{ key: genKey(), instruction: '', image_url: '' }]);
      }
      setDraftHydrated(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr('');
      try {
        const full = await shopApi.getRecipe(id!);
        if (cancelled) return;
        const r = full.recipe;
        const baseNorm = r?.updated_at != null ? String(r.updated_at) : null;
        baselineUpdatedAtRef.current = baseNorm;

        const d = readRecipeDraft(id!);
        const draftBaseNorm = d?.serverUpdatedAt != null ? String(d.serverUpdatedAt) : null;
        const match =
          d && d.v === 1 && d.recipeScope === id && draftBaseNorm === baseNorm;

        if (match) {
          applyDraftPayload(d);
        } else {
          applyServerRecipe(full);
          if (d?.recipeScope === id) clearRecipeDraft(id!);
        }
        setDraftHydrated(true);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load');
        if (!cancelled) setDraftHydrated(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isNew, applyDraftPayload, applyServerRecipe]);

  useEffect(() => {
    snapshotRef.current = {
      prodSearch,
      title,
      description,
      imageUrl,
      videoUrl,
      prep,
      cook,
      servings,
      difficulty,
      cuisine,
      calories,
      categoryId,
      isActive,
      isFeatured,
      isQuick,
      isBudget,
      isTrending,
      ingredients: ingredients.map(({ ingredient_name, quantity, unit, optional, product_id }) => ({
        ingredient_name,
        quantity,
        unit,
        optional,
        product_id,
      })),
      steps: steps.map(({ instruction, image_url }) => ({ instruction, image_url })),
    };
  });

  const persistDraftNow = useCallback((scope: 'new' | string) => {
    if (suppressPersistRef.current) return;
    const snap = snapshotRef.current;
    if (!snap || !draftHydratedRef.current) return;
    const payload: RecipeEditDraftPayload = {
      v: 1,
      recipeScope: scope,
      savedAt: Date.now(),
      serverUpdatedAt: baselineUpdatedAtRef.current,
      ...snap,
    };
    writeRecipeDraft(scope, payload);
  }, []);

  useEffect(() => {
    const scope: 'new' | string = isNew ? 'new' : id!;
    return () => {
      window.clearTimeout(autosaveTimerRef.current);
      persistDraftNow(scope);
    };
  }, [id, isNew, persistDraftNow]);

  useEffect(() => {
    if (!draftHydrated || loading || saving) return;
    const scope: 'new' | string = isNew ? 'new' : id!;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => persistDraftNow(scope), 380);
    return () => window.clearTimeout(autosaveTimerRef.current);
  }, [
    draftHydrated,
    loading,
    saving,
    isNew,
    id,
    prodSearch,
    title,
    description,
    imageUrl,
    videoUrl,
    prep,
    cook,
    servings,
    difficulty,
    cuisine,
    calories,
    categoryId,
    isActive,
    isFeatured,
    isQuick,
    isBudget,
    isTrending,
    ingredients,
    steps,
    persistDraftNow,
  ]);

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

  const addBlankIngredient = () =>
    setIngredients((s) => [
      ...s,
      { key: genKey(), ingredient_name: '', quantity: '1', unit: '', optional: false, product_id: '' },
    ]);

  const addIngredientFromProduct = (p: ProductOpt) => {
    setIngredients((s) => [
      ...s,
      {
        key: genKey(),
        ingredient_name: p.name,
        quantity: '1',
        unit: '',
        optional: false,
        product_id: p.id,
      },
    ]);
  };

  const removeIng = (key: string) => {
    delete ingredientNameRefs.current[key];
    setIngredients((s) => s.filter((x) => x.key !== key));
  };

  const focusIngredientRow = (key: string) => {
    const el = ingredientNameRefs.current[key];
    el?.focus();
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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
    if (ingPayload.length === 0) {
      setErr('Add at least one ingredient');
      return;
    }
    if (ingPayload.some((x) => !x.ingredient_name || !x.product_id)) {
      setErr('Each ingredient needs a name and a mapped product');
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
        suppressPersistRef.current = true;
        clearRecipeDraft('new');
        navigate('/recipes');
      } else {
        await shopApi.updateRecipe(id!, body);
        suppressPersistRef.current = true;
        clearRecipeDraft(id!);
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
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2 sm:p-3 md:p-4 lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
        <Link
          to="/recipes"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <ChefHat className="h-5 w-5 shrink-0 text-violet-600" />
        <h1 className="min-w-0 flex-1 text-base font-semibold text-slate-900 dark:text-slate-100">
          {isNew ? 'New recipe' : 'Edit recipe'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/recipes')}
            className="h-8 rounded-md border border-slate-200 px-3 text-xs dark:border-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="h-8 rounded-md bg-violet-600 px-4 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </header>

      {err && (
        <div className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:gap-3">
        {/* Left: basics + steps (scroll inside steps when many) */}
        <div className="flex min-h-0 w-full flex-col gap-2 lg:h-full lg:min-h-0 lg:w-[40%] lg:shrink-0 xl:w-[36%]">
          <section className="shrink-0 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/40">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Basics</h2>
            <div>
              <label htmlFor="recipe-title" className={`mb-0.5 block ${labelXs}`}>
                Title *
              </label>
              <input id="recipe-title" className={fieldSm} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="recipe-desc" className={`mb-0.5 block ${labelXs}`}>
                Description
              </label>
              <textarea
                id="recipe-desc"
                rows={2}
                className={`${fieldSm} min-h-[42px] resize-y py-1.5`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-2">
                <label htmlFor="recipe-category" className={`mb-0.5 block ${labelXs}`}>
                  Category
                </label>
                <select
                  id="recipe-category"
                  title="Recipe category"
                  className={fieldSm}
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
              <div className="col-span-1">
                <label htmlFor="recipe-cuisine" className={`mb-0.5 block ${labelXs}`}>
                  Cuisine
                </label>
                <input id="recipe-cuisine" className={fieldSm} value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Optional" />
              </div>
              <div className="col-span-1">
                <label htmlFor="recipe-difficulty" className={`mb-0.5 block ${labelXs}`}>
                  Difficulty
                </label>
                <input
                  id="recipe-difficulty"
                  className={fieldSm}
                  placeholder="Easy…"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className={`mb-0.5 block ${labelXs}`}>Prep</label>
                <input
                  type="number"
                  min={0}
                  className={fieldSm}
                  value={prep}
                  onChange={(e) => setPrep(e.target.value)}
                  title="Prep time (minutes)"
                />
              </div>
              <div>
                <label className={`mb-0.5 block ${labelXs}`}>Cook</label>
                <input
                  type="number"
                  min={0}
                  className={fieldSm}
                  value={cook}
                  onChange={(e) => setCook(e.target.value)}
                  title="Cook time (minutes)"
                />
              </div>
              <div>
                <label className={`mb-0.5 block ${labelXs}`}>Srv</label>
                <input
                  type="number"
                  min={1}
                  className={fieldSm}
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  title="Servings"
                />
              </div>
              <div>
                <label className={`mb-0.5 block ${labelXs}`}>kcal</label>
                <input
                  type="number"
                  min={0}
                  className={fieldSm}
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  title="Calories"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="recipe-video" className={`mb-0.5 block ${labelXs}`}>
                  Video URL
                </label>
                <input
                  id="recipe-video"
                  className={fieldSm}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="shrink-0">
                <label className={`mb-0.5 block ${labelXs}`}>Hero</label>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                  <Upload className="h-3.5 w-3.5" /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={uploadHero} />
                </label>
              </div>
            </div>
            {imageUrl ? (
              <p className="truncate text-[10px] text-slate-500" title={imageUrl}>
                {imageUrl}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                />
                Featured
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={isQuick}
                  onChange={(e) => setIsQuick(e.target.checked)}
                />
                Quick
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={isBudget}
                  onChange={(e) => setIsBudget(e.target.checked)}
                />
                Budget
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={isTrending}
                  onChange={(e) => setIsTrending(e.target.checked)}
                />
                Trending
              </label>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
              <div>
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Steps</h2>
                <p className="text-[10px] text-slate-500">Drag to reorder · scroll when list grows</p>
              </div>
              <button
                type="button"
                onClick={addStep}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              <div className="space-y-1.5 pr-0.5">
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
                    className="flex gap-1.5 rounded-md border border-slate-100 p-1.5 dark:border-slate-800"
                  >
                    <div className="flex cursor-grab items-start pt-1 text-slate-400">
                      <GripVertical className="h-4 w-4 shrink-0" />
                      <span className="w-5 shrink-0 text-center text-[10px] font-bold text-slate-500">{idx + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <textarea
                        rows={2}
                        className="min-h-[40px] w-full resize-y rounded border border-slate-200 px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
                        placeholder="Instruction"
                        value={st.instruction}
                        onChange={(e) => patchStep(st.key, { instruction: e.target.value })}
                      />
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] dark:border-slate-600 dark:bg-slate-950"
                        placeholder="Step image URL (optional)"
                        value={st.image_url}
                        onChange={(e) => patchStep(st.key, { image_url: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStep(st.key)}
                      className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      aria-label={`Remove step ${idx + 1}`}
                      title="Remove step"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right: ingredients — table scrolls independently */}
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40 min-h-[280px] lg:h-full lg:min-h-0">
          <div className="shrink-0 space-y-2 border-b border-slate-100 p-2.5 dark:border-slate-800">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Ingredients *</h2>
                <p className="text-[10px] text-slate-500">
                  Search to quick-add or add a blank row; map each line to a product.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="recipe-prod-search" className={`mb-0.5 block ${labelXs}`}>
                  Catalog search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="recipe-prod-search"
                    className="h-8 w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    placeholder="Name or SKU…"
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addBlankIngredient}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700"
              >
                <Plus className="h-3.5 w-3.5" /> Blank row
              </button>
            </div>
            {quickAddProducts.length > 0 && (
              <div className="rounded-md bg-slate-50/90 p-1.5 dark:bg-slate-950/40">
                <p className="mb-1 text-[10px] font-medium text-slate-600 dark:text-slate-400">Quick add</p>
                <div className="flex max-h-16 flex-wrap gap-1 overflow-y-auto">
                  {quickAddProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addIngredientFromProduct(p)}
                      className="max-w-full truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-left text-[10px] font-medium hover:border-violet-300 dark:border-slate-600 dark:bg-slate-900"
                      title={`${p.name} (${p.sku})`}
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {ingredients.length === 0 ? (
              <div className="flex h-full min-h-[120px] items-center justify-center border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-700">
                No ingredients — search above or add a blank row.
              </div>
            ) : (
              <Table className="!min-w-[760px]">
                <thead>
                  <TableHeaderRow className="!bg-slate-50 dark:!bg-slate-800/80">
                    <TableHead className="!w-8 !py-2 text-center text-[11px] font-semibold">#</TableHead>
                    <TableHead className="!min-w-[120px] !py-2 text-[11px] font-semibold">Ingredient</TableHead>
                    <TableHead className="!w-16 !py-2 text-[11px] font-semibold">Qty</TableHead>
                    <TableHead className="!w-16 !py-2 text-[11px] font-semibold">Unit</TableHead>
                    <TableHead className="!min-w-[180px] !py-2 text-[11px] font-semibold">Product</TableHead>
                    <TableHead className="!w-14 py-2 text-center text-[11px] font-semibold">Opt</TableHead>
                    <TableHead className="!w-[72px] !py-2 text-right text-[11px] font-semibold">⋯</TableHead>
                  </TableHeaderRow>
                </thead>
                <TableBody>
                  {ingredients.map((ing, idx) => {
                    const cellIn = 'h-8 rounded border border-slate-200 px-1.5 text-xs dark:border-slate-600 dark:bg-slate-950';
                    return (
                      <TableRow key={ing.key} className="align-middle">
                        <TableCell className="py-1.5 text-center text-[11px] text-slate-500">{idx + 1}</TableCell>
                        <TableCell className="py-1.5">
                          <input
                            ref={(el) => {
                              ingredientNameRefs.current[ing.key] = el;
                            }}
                            aria-label={`Ingredient ${idx + 1} name`}
                            className={`${cellIn} w-full min-w-[100px]`}
                            placeholder="Name"
                            value={ing.ingredient_name}
                            onChange={(e) => patchIng(ing.key, { ingredient_name: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`Ingredient ${idx + 1} quantity`}
                            className={`${cellIn} w-full`}
                            value={ing.quantity}
                            onChange={(e) => patchIng(ing.key, { quantity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <input
                            aria-label={`Ingredient ${idx + 1} unit`}
                            className={`${cellIn} w-full`}
                            placeholder="g…"
                            value={ing.unit}
                            onChange={(e) => patchIng(ing.key, { unit: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <RecipeIngredientProductCombo
                            products={products}
                            value={ing.product_id}
                            onChange={(productId) => patchIng(ing.key, { product_id: productId })}
                            buttonClassName={cellIn}
                            ariaLabel={`Ingredient ${idx + 1} mapped product`}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Ingredient ${idx + 1} optional`}
                            checked={ing.optional}
                            onChange={(e) => patchIng(ing.key, { optional: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => focusIngredientRow(ing.key)}
                              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                              title="Focus row"
                              aria-label={`Edit ingredient row ${idx + 1}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeIng(ing.key)}
                              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              title="Remove"
                              aria-label={`Delete ingredient row ${idx + 1}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <p className="shrink-0 border-t border-slate-100 px-2.5 py-1 text-[10px] text-slate-500 dark:border-slate-800">
            Open Product in each row to search by name or SKU. Catalog search above is for quick-add chips.
          </p>
        </section>
      </div>
    </div>
  );
}
