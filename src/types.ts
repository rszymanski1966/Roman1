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
  created_at: string;
}

export type SubstituteListItem = Pick<Substitute, "id" | "name" | "ratio" | "notes">;

export type IngredientListItem = Pick<Ingredient, "id" | "name">;

export interface AddSubstituteInput {
  ingredientName: string;
  categoryId: string;
  substituteName: string;
  ratio: string;
  notes: string | null;
}

export interface AddSubstituteResult {
  ingredientId: string;
  categoryId: string;
}
