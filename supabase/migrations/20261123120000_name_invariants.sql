-- Name invariants: the database itself keeps the name rules the app applies
-- (src/lib/entry-fields.ts), so a direct write through PostgREST as
-- authenticated cannot store a name the app would never write.
--
--   - ingredients_name_key_matches_name: name_key = lower(name). name_key is
--     computed by the app (S-01 exception, see lessons.md); it stays a plain
--     column, the check only stops a key that drifts from its name (a rename
--     must still send both together).
--   - ingredients_name_normalized, substitutes_name_normalized: the name is
--     normalized like normalizeName (trim + collapse internal whitespace to one
--     space): no whitespace at either end, no whitespace run other than a single
--     space.
--
-- Whitespace class: the exact set JS `\s` (and String.prototype.trim) uses, so
-- every name normalizeName produces passes, and a name that passes is one
-- normalizeName leaves unchanged:
--   \t \n \v \f \r, space, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029,
--   U+202F, U+205F, U+3000, U+FEFF.
-- The characters are regex escapes (\uXXXX) in a plain string literal, so the
-- file stays ASCII. Not Postgres `\s`: it follows the locale provider (libc
-- leaves out U+00A0, U+2007, U+202F; ICU adds U+001C-U+001F and U+0085, which
-- JS keeps), and btrim only trims plain spaces.
--
-- Schema only, no data change: adding a check validates the existing rows, so a
-- violating row makes the whole migration fail (one transaction per file).
--
-- Rollback:
--   alter table public.substitutes drop constraint substitutes_name_normalized;
--   alter table public.ingredients drop constraint ingredients_name_normalized;
--   alter table public.ingredients drop constraint ingredients_name_key_matches_name;

-- ---------------------------------------------------------------------------
-- ingredients: key follows the name, name normalized
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add constraint ingredients_name_key_matches_name
  check (name_key = lower(name));

alter table public.ingredients
  add constraint ingredients_name_normalized
  check (
    name = regexp_replace(
      regexp_replace(
        name,
        '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
        '',
        'g'
      ),
      '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',
      ' ',
      'g'
    )
  );

-- ---------------------------------------------------------------------------
-- substitutes: name normalized (name_key is generated from lower(name))
-- ---------------------------------------------------------------------------
alter table public.substitutes
  add constraint substitutes_name_normalized
  check (
    name = regexp_replace(
      regexp_replace(
        name,
        '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
        '',
        'g'
      ),
      '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',
      ' ',
      'g'
    )
  );
