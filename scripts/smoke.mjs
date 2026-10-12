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

// Values captured by earlier steps and used by later ones.
let categoryId = "";
let listPath = "";
let firstSubstituteId = "";
let secondSubstituteId = "";

// The substitute id from the mark-as-best form of the card whose name is exactly `name` (the name renders as >name<).
function substituteIdFor(body, name) {
  const start = body.indexOf(`>${name}<`);
  if (start === -1) return "";
  return /name="substitute_id" value="([0-9a-f-]{36})"/i.exec(body.slice(start))?.[1] ?? "";
}

// Form fields for /api/substitutes/best: the pair comes from the list URL, so the redirect returns to the same list.
function bestForm(substituteId, isBest) {
  const params = new URLSearchParams(listPath.split("?")[1] ?? "");
  return {
    substitute_id: substituteId,
    is_best: isBest,
    ingredient: params.get("ingredient") ?? "",
    category: params.get("category") ?? "",
  };
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
      categoryId = /<option value="([0-9a-f-]{36})"/i.exec(actual.body)?.[1] ?? "";
      return actual;
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
    // B needs its own ingredient, otherwise the list page short-circuits to "no ingredients" and never queries substitutes.
    "account B adds its own ingredient",
    () =>
      request("/api/ingredients", {
        method: "POST",
        cookies: jarB,
        form: {
          ingredient: `smoke-ingredient-${runId}-b`,
          category_id: categoryId,
          substitute: `smoke-substitute-${runId}-b`,
          ratio: "1:1",
        },
      }),
    { status: 302, location: "/ingredients?ingredient=" },
  ],
  [
    "account B sees empty state on account A's URL",
    () => request(listPath, { cookies: jarB }),
    { status: 200, bodyIncludes: "Brak zamienników", bodyExcludes: substituteMarker },
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
