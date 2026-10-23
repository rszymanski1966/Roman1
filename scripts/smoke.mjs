// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together,
// and that one account cannot see another account's ingredients and substitutes.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
// Hosted Supabase rejects reserved domains such as example.com, so the domain is overridable via SMOKE_EMAIL_DOMAIN.
const emailDomain = process.env.SMOKE_EMAIL_DOMAIN ?? "mailinator.com";
const runId = Date.now();
const email = `smoke-${runId}@${emailDomain}`;
const emailB = `smoke-${runId}-b@${emailDomain}`;
const password = "Smoke-Test-Passw0rd!";
// Unique marker: present in account A's list, must never appear in account B's response.
const substituteMarker = `smoke-substitute-${runId}`;

// One cookie jar per session: account A, account B, and an always-anonymous visitor.
const jar = new Map();
const jarB = new Map();
const anonJar = new Map();

// Second substitute in the same pair (best-substitute steps). Not prefixed by substituteMarker, so lookups stay unambiguous.
const secondSubstitute = `smoke-second-${runId}`;
// Third substitute, added with the "best" checkbox on the add form.
const thirdSubstitute = `smoke-third-${runId}`;
// Search steps: an ingredient whose name is disjoint from the other ones (smoke-ingredient-* would also match B's own),
// searched by a fragment from the middle of its name. Its substitute is not prefixed by substituteMarker either.
const searchIngredient = `smoke-search-${runId}`;
const searchFragment = `search-${runId}`;
const foundSubstitute = `smoke-found-${runId}`;
// Second substitute of the search ingredient, in the other category (the view without a category shows two sections).
const otherSubstitute = `smoke-other-${runId}`;
// New name of the third substitute after the edit steps (not a prefix of any other name).
const editedSubstitute = `smoke-edited-${runId}`;
// New name of the search ingredient after the rename steps. It still contains searchFragment, so the search
// context the rename returns to stays valid.
const renamedIngredient = `smoke-renamed-search-${runId}`;

// Values captured by earlier steps and used by later ones.
let categoryId = "";
let otherCategoryId = "";
let listPath = "";
// Account B's list with its own ingredient (the redirect after B adds it).
let listPathB = "";
// Redirects after a mark-as-best error, tied to a card with error_for (the #anchor is stripped before the GET).
let cardErrorPath = "";
let topErrorPathB = "";
// Redirect after an add-form validation error that names its field (error_field=ratio).
let addFieldErrorPath = "";
let firstSubstituteId = "";
let secondSubstituteId = "";
let thirdSubstituteId = "";
let searchIngredientId = "";
let foundSubstituteId = "";

// The substitute id from the mark-as-best form of the card whose name is exactly `name` (the name renders as >name<).
function substituteIdFor(body, name) {
  const start = body.indexOf(`>${name}<`);
  if (start === -1) return "";
  return /name="substitute_id" value="([0-9a-f-]{36})"/i.exec(body.slice(start))?.[1] ?? "";
}

// Form fields for /api/substitutes/best: the pair comes from the list URL (account A's by default),
// so the redirect returns to the same list.
function bestForm(substituteId, isBest, path = listPath) {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  return {
    substitute_id: substituteId,
    is_best: isBest,
    ingredient: params.get("ingredient") ?? "",
    category: params.get("category") ?? "",
  };
}

// Form fields for /api/substitutes/update: the edited values plus the same list context as bestForm.
function editForm(substituteId, values, path = listPath) {
  const { ingredient, category } = bestForm(substituteId, "", path);
  return { substitute_id: substituteId, ingredient, category, ...values };
}

// Form fields for /api/ingredients/rename: the new name plus the list context of the ingredient's own view
// (all categories); `context` adds or overrides q and match.
function renameForm(ingredientId, name, context = {}) {
  return { ingredient_id: ingredientId, name, ingredient: ingredientId, category: "", ...context };
}

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(cookies, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) cookies.delete(name.trim());
    else cookies.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, cookies = jar } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookies),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(cookies, response);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    body: await response.text(),
  };
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "ingredients list redirects anonymous user",
    () => request("/ingredients", { cookies: anonJar }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "add ingredient redirects anonymous user",
    () =>
      request("/api/ingredients", {
        method: "POST",
        cookies: anonJar,
        form: { ingredient: "smoke", category_id: "", substitute: substituteMarker, ratio: "1:1" },
      }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  [
    "add form lists categories for account A",
    async () => {
      const actual = await request("/ingredients/new");
      const ids = [...actual.body.matchAll(/<option value="([0-9a-f-]{36})"/gi)].map((match) => match[1]);
      categoryId = ids[0] ?? "";
      otherCategoryId = ids[1] ?? "";
      // Fail the step without a second category: the category-filter search step needs one.
      return otherCategoryId ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: "<option value=" },
  ],
  [
    "account A adds ingredient with substitute",
    async () => {
      const actual = await request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: substituteMarker,
          ratio: "1:1",
          notes: "smoke",
        },
      });
      listPath = actual.location;
      return actual;
    },
    { status: 302, location: "/ingredients?ingredient=" },
  ],
  ["account A sees its substitute", () => request(listPath), { status: 200, bodyIncludes: substituteMarker }],
  [
    // The add form offers A's saved ingredients (datalist options carry names). The closing quote is required:
    // B's ingredient name (added later) starts with this one.
    "add form suggests account A's ingredient",
    () => request("/ingredients/new"),
    { status: 200, bodyIncludes: `<option value="smoke-ingredient-${runId}"` },
  ],
  [
    "account A adds a second substitute in the same pair",
    () =>
      request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: secondSubstitute,
          ratio: "2:1",
        },
      }),
    { status: 302, location: "/ingredients?ingredient=" },
  ],
  [
    "account A list shows both substitutes",
    async () => {
      const actual = await request(listPath);
      firstSubstituteId = substituteIdFor(actual.body, substituteMarker);
      secondSubstituteId = substituteIdFor(actual.body, secondSubstitute);
      // Fail the step if either id could not be parsed, instead of posting empty ids later.
      return firstSubstituteId && secondSubstituteId ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: secondSubstitute },
  ],
  [
    // No previous best: back to the same list without a notice.
    "account A marks the first substitute as best",
    () => request("/api/substitutes/best", { method: "POST", form: bestForm(firstSubstituteId, "1") }),
    () => ({ status: 302, location: listPath, locationExcludes: "notice=" }),
  ],
  ["account A list shows the best badge", () => request(listPath), { status: 200, bodyIncludes: "data-best-badge" }],
  [
    // Replaces the first one: the notice names the previous best (URLSearchParams encodes spaces as '+').
    "account A marks the second substitute as best",
    () => request("/api/substitutes/best", { method: "POST", form: bestForm(secondSubstituteId, "1") }),
    () => ({
      status: 302,
      location: listPath,
      locationIncludes: `notice=Najlepszy+zamiennik+zmieniony%3A+${substituteMarker}+`,
    }),
  ],
  [
    // A bad is_best with a valid substitute id: the error is tied to that card (error_for + #substitute-<id> anchor).
    "account A best-mark error is tied to its card",
    async () => {
      const actual = await request("/api/substitutes/best", { method: "POST", form: bestForm(firstSubstituteId, "x") });
      cardErrorPath = actual.location.split("#")[0];
      return actual;
    },
    () => ({ status: 302, location: listPath, locationIncludes: `error_for=${firstSubstituteId}` }),
  ],
  [
    // The card is on A's list, so the error renders inside it instead of at the top.
    "account A list shows the error in the card",
    () => request(cardErrorPath),
    { status: 200, bodyIncludes: "data-substitute-error" },
  ],
  [
    // Validation error (empty ratio): the checked "best" checkbox is echoed back to the form.
    "add form echoes the best checkbox after a validation error",
    () =>
      request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: thirdSubstitute,
          ratio: "",
          is_best: "1",
        },
      }),
    { status: 302, location: "/ingredients/new?error=", locationIncludes: "is_best=1" },
  ],
  [
    // Same empty ratio: the redirect names the field (error_field, after the echo).
    "add form validation error names the ratio field",
    async () => {
      const actual = await request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: thirdSubstitute,
          ratio: "",
        },
      });
      addFieldErrorPath = actual.location;
      return actual;
    },
    {
      status: 302,
      location: `/ingredients/new?${new URLSearchParams({ error: "Podaj proporcję." })}`,
      locationIncludes: "error_field=ratio",
    },
  ],
  [
    // Only the ratio input is marked: one aria-invalid on the page, on that input, tied to the error's id.
    "add form marks the ratio field after the error",
    async () => {
      const actual = await request(addFieldErrorPath);
      const ratioInput = /<input\b[^>]*\bname="ratio"[^>]*>/.exec(actual.body)?.[0] ?? "";
      // Count attributes in tags only: in dev the page inlines Tailwind CSS with [aria-invalid="true"] selectors.
      const marked = actual.body.match(/<[a-z][^>]*\baria-invalid="true"/g)?.length ?? 0;
      const tied = ratioInput.includes('aria-describedby="add-error"') && actual.body.includes('id="add-error"');
      return ratioInput.includes('aria-invalid="true"') && marked === 1 && tied ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: 'aria-invalid="true"' },
  ],
  [
    // Adding with the checkbox replaces the current best (the second one) and shows the same notice as the list.
    "account A adds a third substitute marked as best",
    () =>
      request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: thirdSubstitute,
          ratio: "3:1",
          is_best: "1",
        },
      }),
    () => ({
      status: 302,
      location: listPath,
      locationIncludes: `notice=Najlepszy+zamiennik+zmieniony%3A+${secondSubstitute}+`,
    }),
  ],
  [
    // Same ingredient and category, same name in a different case: the unique (pair, name_key) constraint rejects it.
    "account A cannot add a duplicate substitute",
    () =>
      request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: substituteMarker.toUpperCase(),
          ratio: "2:1",
        },
      }),
    // Prefix up to the closing quote: proves the conflict message, not just any validation error.
    {
      status: 302,
      location: `/ingredients/new?${new URLSearchParams({ error: `Zamiennik „${substituteMarker.toUpperCase()}”` })}`,
    },
  ],
  [
    // The same duplicate: the conflict is about the substitute field, not the whole form.
    "add form duplicate error names the substitute field",
    () =>
      request("/api/ingredients", {
        method: "POST",
        form: {
          ingredient: `smoke-ingredient-${runId}`,
          category_id: categoryId,
          substitute: substituteMarker.toUpperCase(),
          ratio: "2:1",
        },
      }),
    {
      status: 302,
      location: `/ingredients/new?${new URLSearchParams({ error: `Zamiennik „${substituteMarker.toUpperCase()}”` })}`,
      locationIncludes: "error_field=substitute",
    },
  ],
  [
    "account A adds an ingredient for the search steps",
    async () => {
      const actual = await request("/api/ingredients", {
        method: "POST",
        form: { ingredient: searchIngredient, category_id: categoryId, substitute: foundSubstitute, ratio: "1:1" },
      });
      searchIngredientId = new URLSearchParams(actual.location.split("?")[1] ?? "").get("ingredient") ?? "";
      return actual;
    },
    { status: 302, location: "/ingredients?ingredient=" },
  ],
  [
    // No match param and no cookie yet, so the default "contains" applies. One hit shows its substitutes right away.
    "search by a fragment from the middle of the name finds the ingredient",
    () => request(`/ingredients?q=${searchFragment}`),
    { status: 200, bodyIncludes: foundSubstitute },
  ],
  [
    "prefix search by the same fragment finds nothing and remembers the mode",
    async () => {
      const actual = await request(`/ingredients?q=${searchFragment}&match=prefix`);
      // The jar had no mode cookie before, so this response must have set it.
      return jar.get("ingredients_match") === "prefix" ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: "Nie znaleziono składnika" },
  ],
  [
    "search without match uses the remembered prefix mode",
    () => request(`/ingredients?q=${searchFragment}`),
    { status: 200, bodyIncludes: "Nie znaleziono składnika" },
  ],
  [
    // The cookie still says prefix: the URL mode must win, and the category filter must let the ingredient through.
    "contains from the URL beats the cookie and the category filter keeps the ingredient",
    () => request(`/ingredients?q=${searchFragment}&match=contains&category=${categoryId}`),
    { status: 200, bodyIncludes: foundSubstitute },
  ],
  [
    // Explicit contains: the step must not depend on the remembered mode, which alone could hide the ingredient.
    "search in a category without its substitutes finds nothing",
    () => request(`/ingredients?q=${searchFragment}&match=contains&category=${otherCategoryId}`),
    { status: 200, bodyIncludes: "Nie znaleziono składnika" },
  ],
  [
    "ingredient view without a category shows the found substitute",
    async () => {
      const actual = await request(`/ingredients?ingredient=${searchIngredientId}`);
      foundSubstituteId = substituteIdFor(actual.body, foundSubstitute);
      // Fail the step if the id could not be parsed, instead of posting an empty id later.
      return foundSubstituteId ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: foundSubstitute },
  ],
  [
    // Back to the search context: ingredient, q and match in this order, the empty category left out.
    "marking the best from a search returns to the search URL",
    () =>
      request("/api/substitutes/best", {
        method: "POST",
        form: {
          substitute_id: foundSubstituteId,
          is_best: "1",
          ingredient: searchIngredientId,
          category: "",
          q: searchFragment,
          match: "contains",
        },
      }),
    () => ({
      status: 302,
      location: `/ingredients?${new URLSearchParams([
        ["ingredient", searchIngredientId],
        ["q", searchFragment],
        ["match", "contains"],
      ])}`,
      locationIncludes: "q=",
      locationExcludes: "error=",
    }),
  ],
  [
    // Both of A's ingredients carry runId: several hits render the list, not a substitute view.
    "search matching several ingredients lists them",
    () => request(`/ingredients?q=${runId}&match=contains`),
    { status: 200, bodyIncludes: "Pasujące składniki (2)" },
  ],
  [
    // The best-mark redirect lands here: with one hit the back link would only lead to this same ingredient.
    "ingredient view from a one-hit search has no back link",
    () => request(`/ingredients?ingredient=${searchIngredientId}&q=${searchFragment}&match=contains`),
    { status: 200, bodyIncludes: foundSubstitute, bodyExcludes: "Wszystkie wyniki dla" },
  ],
  [
    "ingredient view from a several-hit search links back to the results",
    () => request(`/ingredients?ingredient=${searchIngredientId}&q=${runId}&match=contains`),
    { status: 200, bodyIncludes: "Wszystkie wyniki dla" },
  ],
  [
    "account A adds a substitute for the search ingredient in the other category",
    () =>
      request("/api/ingredients", {
        method: "POST",
        form: { ingredient: searchIngredient, category_id: otherCategoryId, substitute: otherSubstitute, ratio: "1:1" },
      }),
    { status: 302, location: "/ingredients?ingredient=" },
  ],
  [
    // categoryId is the first option on the add form (sorted by sort_order), so its section renders first.
    "ingredient view without a category shows both categories in sort order",
    async () => {
      const actual = await request(`/ingredients?ingredient=${searchIngredientId}`);
      const first = actual.body.indexOf(`>${foundSubstitute}<`);
      const second = actual.body.indexOf(`>${otherSubstitute}<`);
      return first !== -1 && first < second ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: otherSubstitute },
  ],
  [
    // The third substitute is the current best of A's pair; the edit page opens with A's list view.
    "edit substitute form shows the current values",
    async () => {
      const list = await request(listPath);
      thirdSubstituteId = substituteIdFor(list.body, thirdSubstitute);
      // Fail the step if the id could not be parsed, instead of posting an empty id later.
      if (!thirdSubstituteId) return { ...list, status: 0 };
      const view = new URLSearchParams(listPath.split("?")[1] ?? "");
      return request(`/ingredients/edit-substitute?substitute=${thirdSubstituteId}&${view}`);
    },
    { status: 200, bodyIncludes: `value="${thirdSubstitute}"` },
  ],
  [
    "account A edits the best substitute",
    () =>
      request("/api/substitutes/update", {
        method: "POST",
        form: editForm(thirdSubstituteId, { name: editedSubstitute, ratio: "4:1", notes: "smoke edited" }),
      }),
    () => ({ status: 302, location: listPath, locationIncludes: "notice=Zapisano+zmiany." }),
  ],
  [
    // The edit never touches is_best: the renamed card still carries the badge, and the old name is gone.
    "edited substitute keeps the best badge",
    async () => {
      const actual = await request(listPath);
      const start = actual.body.indexOf(`>${editedSubstitute}<`);
      if (start === -1) return { ...actual, status: 0 };
      // The badge must sit in the same card: after the name and before the card's closing </li>.
      const badge = actual.body.indexOf("data-best-badge", start);
      const cardEnd = actual.body.indexOf("</li>", start);
      return badge !== -1 && badge < cardEnd ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: editedSubstitute, bodyExcludes: `>${thirdSubstitute}<` },
  ],
  [
    // Empty ratio: back to the form with the error and the echo; the cleared notes come back as an empty key.
    "edit form echoes values after a validation error",
    async () => {
      const actual = await request("/api/substitutes/update", {
        method: "POST",
        form: editForm(thirdSubstituteId, { name: editedSubstitute, ratio: "", notes: "" }),
      });
      const echo = new URLSearchParams(actual.location.split("?")[1] ?? "");
      return echo.get("name") === editedSubstitute && echo.has("notes") ? actual : { ...actual, status: 0 };
    },
    { status: 302, location: "/ingredients/edit-substitute?", locationIncludes: "error=Podaj+proporcj" },
  ],
  [
    // Same empty ratio: error_field names the field, right after the error (the last of the echo).
    "edit form validation error names the ratio field",
    () =>
      request("/api/substitutes/update", {
        method: "POST",
        form: editForm(thirdSubstituteId, { name: editedSubstitute, ratio: "", notes: "" }),
      }),
    {
      status: 302,
      location: "/ingredients/edit-substitute?",
      locationIncludes: `${new URLSearchParams([
        ["error", "Podaj proporcję."],
        ["error_field", "ratio"],
      ])}`,
    },
  ],
  [
    // Another substitute's name in a different case: the unique (pair, name_key) constraint rejects the rename.
    "account A cannot rename a substitute to a name already in the pair",
    () =>
      request("/api/substitutes/update", {
        method: "POST",
        form: editForm(thirdSubstituteId, { name: secondSubstitute.toUpperCase(), ratio: "4:1" }),
      }),
    // Prefix up to the closing quote: proves the conflict message, not just any validation error.
    {
      status: 302,
      location: "/ingredients/edit-substitute?",
      locationIncludes: `${new URLSearchParams({ error: `Zamiennik „${secondSubstitute.toUpperCase()}”` })}`,
    },
  ],
  [
    // The same duplicate: the conflict is about the name field, not the whole form.
    "edit form duplicate error names the name field",
    async () => {
      const actual = await request("/api/substitutes/update", {
        method: "POST",
        form: editForm(thirdSubstituteId, { name: secondSubstitute.toUpperCase(), ratio: "4:1" }),
      });
      const error = new URLSearchParams(actual.location.split("?")[1] ?? "").get("error") ?? "";
      // Fail the step unless it is the conflict message (not a validation error on the name).
      return error.startsWith(`Zamiennik „${secondSubstitute.toUpperCase()}”`) ? actual : { ...actual, status: 0 };
    },
    { status: 302, location: "/ingredients/edit-substitute?", locationIncludes: "error_field=name" },
  ],
  [
    // Back to the search context: ingredient, q and match in listRedirect order, the empty category left out.
    // Runs after every step that looks the search ingredient up by its old name.
    "account A renames the search ingredient from a search",
    () =>
      request("/api/ingredients/rename", {
        method: "POST",
        form: renameForm(searchIngredientId, renamedIngredient, { q: searchFragment, match: "contains" }),
      }),
    () => ({
      status: 302,
      location: `/ingredients?${new URLSearchParams([
        ["ingredient", searchIngredientId],
        ["q", searchFragment],
        ["match", "contains"],
        ["notice", "Zapisano zmiany."],
      ])}`,
    }),
  ],
  [
    // The heading renders the name alone (>name<, the "Zmień nazwę" link only in aria-label); the old name is gone.
    "renamed ingredient shows its new name",
    () => request(`/ingredients?ingredient=${searchIngredientId}`),
    { status: 200, bodyIncludes: `>${renamedIngredient}<`, bodyExcludes: `>${searchIngredient}<` },
  ],
  [
    // A's first ingredient in a different case: the unique (user_id, name_key) constraint rejects the rename.
    "account A cannot rename an ingredient to an existing name",
    () =>
      request("/api/ingredients/rename", {
        method: "POST",
        form: renameForm(searchIngredientId, `smoke-ingredient-${runId}`.toUpperCase()),
      }),
    // Prefix up to the closing quote: proves the conflict message, not just any validation error.
    {
      status: 302,
      location: "/ingredients/edit-ingredient?",
      locationIncludes: `${new URLSearchParams({ error: `Składnik „${`smoke-ingredient-${runId}`.toUpperCase()}”` })}`,
    },
  ],
  [
    "signup creates account B",
    () => request("/api/auth/signup", { method: "POST", cookies: jarB, form: { email: emailB, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin accepts account B",
    () => request("/api/auth/signin", { method: "POST", cookies: jarB, form: { email: emailB, password } }),
    { status: 302, location: "/" },
  ],
  [
    // RLS hides A's row from B, so the function reports "not found" and nothing changes.
    "account B cannot mark account A's substitute",
    () => request("/api/substitutes/best", { method: "POST", cookies: jarB, form: bestForm(firstSubstituteId, "1") }),
    () => ({ status: 302, location: listPath, locationIncludes: "error=" }),
  ],
  [
    // RLS hides A's row from B, so the update changes no row and the service reports "not found".
    "account B cannot edit account A's substitute",
    () =>
      request("/api/substitutes/update", {
        method: "POST",
        cookies: jarB,
        form: editForm(firstSubstituteId, { name: `smoke-taken-${runId}`, ratio: "1:1" }),
      }),
    { status: 302, location: "/ingredients/edit-substitute?", locationIncludes: "error=Nie+znaleziono+zamiennika." },
  ],
  [
    "account B edit page for account A's substitute shows not found",
    () => request(`/ingredients/edit-substitute?substitute=${firstSubstituteId}`, { cookies: jarB }),
    { status: 200, bodyIncludes: "Nie znaleziono zamiennika", bodyExcludes: `value="${substituteMarker}"` },
  ],
  [
    // RLS hides A's row from B, so the update changes no row and the service reports "not found".
    "account B cannot rename account A's ingredient",
    () =>
      request("/api/ingredients/rename", {
        method: "POST",
        cookies: jarB,
        form: renameForm(searchIngredientId, `smoke-taken-${runId}`),
      }),
    {
      status: 302,
      location: "/ingredients/edit-ingredient?",
      locationIncludes: "error=Nie+znaleziono+sk%C5%82adnika.",
    },
  ],
  [
    // B needs its own ingredient, otherwise the list page short-circuits to "no ingredients" and never queries substitutes.
    "account B adds its own ingredient",
    async () => {
      const actual = await request("/api/ingredients", {
        method: "POST",
        cookies: jarB,
        form: {
          ingredient: `smoke-ingredient-${runId}-b`,
          category_id: categoryId,
          substitute: `smoke-substitute-${runId}-b`,
          ratio: "1:1",
        },
      });
      listPathB = actual.location;
      return actual;
    },
    { status: 302, location: "/ingredients?ingredient=" },
  ],
  [
    // B's own ingredient proves the list renders (not an empty pass); A's name must not leak to B (RLS).
    // The closing quote is required: A's ingredient name is a prefix of B's.
    "add form suggests only account B's own ingredients",
    () => request("/ingredients/new", { cookies: jarB }),
    {
      status: 200,
      bodyIncludes: `value="smoke-ingredient-${runId}-b"`,
      bodyExcludes: `value="smoke-ingredient-${runId}"`,
    },
  ],
  [
    // From B's own list: A's substitute is "not found" for B, and the error still names its id in error_for.
    "account B best-mark error on account A's substitute carries error_for",
    async () => {
      const actual = await request("/api/substitutes/best", {
        method: "POST",
        cookies: jarB,
        form: bestForm(firstSubstituteId, "1", listPathB),
      });
      topErrorPathB = actual.location.split("#")[0];
      return actual;
    },
    () => ({ status: 302, location: listPathB, locationIncludes: `error_for=${firstSubstituteId}` }),
  ],
  [
    // B's cards are on screen, but none is the one in error_for: the error falls back to the top of the page.
    "account B list shows the error at the top, not in a card",
    async () => {
      const actual = await request(topErrorPathB, { cookies: jarB });
      // Fail the step unless B's own card renders, so the missing card error is not just an empty list.
      return actual.body.includes(`>smoke-substitute-${runId}-b<`) ? actual : { ...actual, status: 0 };
    },
    { status: 200, bodyIncludes: 'role="alert"', bodyExcludes: "data-substitute-error" },
  ],
  [
    "account B sees empty state on account A's URL",
    () => request(listPath, { cookies: jarB }),
    { status: 200, bodyIncludes: "Brak zamienników", bodyExcludes: substituteMarker },
  ],
  [
    // Not bodyExcludes: substituteMarker, which is a prefix of B's own substitute name.
    // By searchFragment, which the renamed ingredient still contains: the old full name would find nothing even
    // without isolation.
    "account B search does not find account A's ingredient",
    () => request(`/ingredients?q=${searchFragment}`, { cookies: jarB }),
    () => ({ status: 200, bodyIncludes: "Nie znaleziono składnika", bodyExcludes: searchIngredientId }),
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expectation] of steps) {
  const actual = await run();
  // A function expectation is resolved after the step runs, so it can use values captured by earlier steps (listPath).
  const expected = typeof expectation === "function" ? expectation() : expectation;
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.locationIncludes === undefined || actual.location.includes(expected.locationIncludes)) &&
    (expected.locationExcludes === undefined || !actual.location.includes(expected.locationExcludes)) &&
    (expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes)) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    const body = [
      expected.locationIncludes !== undefined ? `location includes "${expected.locationIncludes}"` : "",
      expected.locationExcludes !== undefined ? `location excludes "${expected.locationExcludes}"` : "",
      expected.bodyIncludes !== undefined ? `body includes "${expected.bodyIncludes}"` : "",
      expected.bodyExcludes !== undefined ? `body excludes "${expected.bodyExcludes}"` : "",
    ]
      .filter(Boolean)
      .join(", ");
    console.log(`      expected ${expected.status} ${expected.location ?? ""} ${body}`.trimEnd());
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
