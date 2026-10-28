-- Rename categories: the names get more precise, the scope stays the same.
-- Only name changes; id (referenced by ingredient_categories) and slug stay.
-- No name is swapped between rows, so the unique constraint on name holds
-- after every statement.

update public.categories set name = 'Ciasta i desery' where slug = 'ciasta';
update public.categories set name = 'Dania tradycyjne' where slug = 'dania-miesne';
update public.categories set name = 'Wegetariańskie i wegańskie' where slug = 'wegetarianskie';
