// Shared entity and DTO types. Hand-written to mirror the migrations in
// supabase/migrations/ (no generated DB types).

export interface Category {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export interface Ingredient {
  id: string;
  user_id: string;
  name: string;
  name_key: string;
  created_at: string;
}

export interface IngredientCategory {
  id: string;
  user_id: string;
  ingredient_id: string;
  category_id: string;
  created_at: string;
}

export interface Substitute {
  id: string;
  user_id: string;
  ingredient_category_id: string;
  name: string;
  // Generated: lower(name). Unique per ingredient_category_id.
  name_key: string;
  ratio: string;
  notes: string | null;
  // At most one true per ingredient_category_id (partial unique index).
  is_best: boolean;
  created_at: string;
}

export type SubstituteListItem = Pick<Substitute, "id" | "name" | "ratio" | "notes" | "is_best">;

export type IngredientListItem = Pick<Ingredient, "id" | "name">;

export interface AddSubstituteInput {
  ingredientName: string;
  categoryId: string;
  substituteName: string;
  ratio: string;
  notes: string | null;
  isBest: boolean;
}

export interface AddSubstituteResult {
  ingredientId: string;
  categoryId: string;
  // Name of the previous best substitute when isBest replaced it, otherwise null.
  replacedName: string | null;
  // User-safe message when the substitute was saved but marking it as best failed.
  bestError: string | null;
}
