// Minimal HTTP client for tests against the running dev server (npm run dev), modelled on scripts/smoke.mjs: one
// cookie jar per session, the Origin header (Astro's checkOrigin rejects form POSTs without it) and no redirect
// following, so a test sees the status and the Location the endpoint chose.

// BASE_URL from the environment, forwarded by vitest.config.ts (Vitest overwrites BASE_URL itself in the workers).
export const BASE_URL = (process.env.HTTP_TEST_BASE_URL ?? "http://localhost:4321").replace(/\/+$/, "");

const SERVER_DOWN =
  `Serwer aplikacji nie odpowiada pod ${BASE_URL}. Uruchom \`npm run dev\` (albo ustaw BASE_URL) ` +
  "i powtórz `npm run test:http`.";

export interface HttpResponse {
  status: number;
  // Same-origin redirects as path + query + hash (so they compare across BASE_URL spellings); "" without a Location.
  location: string;
  body: string;
}

export type FormFields = Record<string, string>;

function relativeLocation(raw: string | null): string {
  if (!raw) return "";
  const url = new URL(raw, BASE_URL);
  return url.origin === new URL(BASE_URL).origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

/** One browser-like session: its own cookies, sent with every request and updated from every response. */
export class HttpSession {
  private readonly cookies = new Map<string, string>();

  get(path: string): Promise<HttpResponse> {
    return this.request("GET", path);
  }

  postForm(path: string, fields: FormFields): Promise<HttpResponse> {
    return this.request("POST", path, fields);
  }

  private async request(method: "GET" | "POST", path: string, form?: FormFields): Promise<HttpResponse> {
    const response = await fetch(BASE_URL + path, {
      method,
      redirect: "manual",
      headers: {
        Cookie: [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
        Origin: BASE_URL,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    this.storeCookies(response);
    return {
      status: response.status,
      location: relativeLocation(response.headers.get("location")),
      body: await response.text(),
    };
  }

  private storeCookies(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = raw.split(";");
      const [name = "", ...rest] = pair.split("=");
      const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute.trim()));
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), rest.join("="));
    }
  }
}

/** Signs in through the app's own form endpoint (POST /api/auth/signin) and returns the signed-in session. */
export async function signIn(user: { email: string; password: string }): Promise<HttpSession> {
  const session = new HttpSession();
  const response = await session.postForm("/api/auth/signin", { email: user.email, password: user.password });
  // The endpoint answers a successful sign-in with a redirect home and a failed one with ?error= (never the password).
  if (response.status !== 302 || response.location !== "/") {
    throw new Error(
      `Logowanie ${user.email} przez /api/auth/signin nie powiodło się: ${response.status} ${response.location}`,
    );
  }
  return session;
}

/** Fails fast, with one readable message, when the dev server is not running (call it in beforeAll). */
export async function assertServerReachable(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/`, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  } catch (cause) {
    throw new Error(SERVER_DOWN, { cause });
  }
  await response.body?.cancel();
  if (response.status >= 500) throw new Error(`${SERVER_DOWN} (GET / zwrócił ${response.status})`);
}
