const PREFIX = 'myshop_pos_recipe_editor_draft:';

export type RecipeEditDraftIngredient = {
  ingredient_name: string;
  quantity: string;
  unit: string;
  optional: boolean;
  product_id: string;
};

export type RecipeEditDraftStep = {
  instruction: string;
  image_url: string;
};

export type RecipeEditDraftPayload = {
  v: 1;
  /** Use `'new'` for create flow */
  recipeScope: 'new' | string;
  savedAt: number;
  /** `recipe.updated_at` from server snapshot when baseline was loaded (edit only) */
  serverUpdatedAt: string | null;
  prodSearch: string;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  prep: string;
  cook: string;
  servings: string;
  difficulty: string;
  cuisine: string;
  calories: string;
  categoryId: string;
  isActive: boolean;
  isFeatured: boolean;
  isQuick: boolean;
  isBudget: boolean;
  isTrending: boolean;
  ingredients: RecipeEditDraftIngredient[];
  steps: RecipeEditDraftStep[];
};

export function recipeDraftKey(scope: 'new' | string) {
  return `${PREFIX}${scope}`;
}

export function readRecipeDraft(scope: 'new' | string): RecipeEditDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(recipeDraftKey(scope));
    if (!raw) return null;
    const o = JSON.parse(raw) as RecipeEditDraftPayload;
    if (o?.v !== 1 || o.recipeScope !== scope || !Array.isArray(o.ingredients) || !Array.isArray(o.steps)) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

export function writeRecipeDraft(scope: 'new' | string, payload: RecipeEditDraftPayload) {
  try {
    sessionStorage.setItem(recipeDraftKey(scope), JSON.stringify(payload));
  } catch {
    /* quota / privacy mode */
  }
}

export function clearRecipeDraft(scope: 'new' | string) {
  try {
    sessionStorage.removeItem(recipeDraftKey(scope));
  } catch {
    /* ignore */
  }
}
