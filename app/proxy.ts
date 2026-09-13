import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { tryGetEnv, type Env } from "./lib/env";
import {
  alphaRouteDisabled,
  alphaUserAllowed,
  parseAlphaPolicy,
} from "./lib/alpha-policy";

/**
 * Route classification — asymmetric failure by design (Q1).
 *
 * PUBLIC routes hold no protected data, so they must fail OPEN: a missing or
 * misconfigured Supabase env degrades to "serve the page without auth-aware
 * features", never a 5xx.
 *
 * PROTECTED routes must fail CLOSED: missing env or no session => 401 JSON for
 * APIs, login redirect for pages; never serve protected content.
 *
 * Anything not explicitly public is treated as protected (Q3, safe default).
 */
// Public marketing/SEO/trust surfaces — readable WITHOUT signing in. Everything
// not listed here (notably /app/*) stays protected by the safe default below.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/blog",
  "/honesty",
  "/audit",
  "/api/v2/status",
  "/api/v2/preview",
  "/api/v2/access/prepare",
  "/invite",
  "/pricing",
  "/privacy",
  "/terms",
  "/methodology",
  "/demo/monthly",
  "/demo/reviewed-import",
  "/api/demo/company",
  "/api/maintenance",
]);

// These code-owned examples are deliberately public. Do not bypass auth for
// arbitrary PDF/ZIP files or other paths under /examples.
const PUBLIC_EXAMPLES = new Set([
  ...["2026-07", "2026-08"].flatMap((month) =>
    [
      "messy-costs.csv",
      "canonical-costs.csv",
      "outcomes.csv",
      "revenue.csv",
      "report.json",
    ].map((name) => `/examples/reviewed-import/${month}-${name}`),
  ),
  "/examples/InfFyn-Northstar-August-2026.pdf",
  "/examples/InfFyn-normalized-CSV-examples.zip",
  "/examples/CSV-IMPORT-GUIDE.txt",
  "/examples/InfFyn-CSV-test-pack.zip",
  "/examples/csv-test-pack/README.md",
]);

function isPublicRoute(pathname: string): boolean {
  if (
    process.env.INFFYN_PREVIEW_MODE === "true" &&
    ["/review", "/api/review/start", "/api/review/calculate"].includes(pathname)
  )
    return true;
  if (
    (["/validation", "/validation/monthly"].includes(pathname) ||
      pathname.startsWith("/api/validation/")) &&
    process.env.NODE_ENV === "development" &&
    process.env.INFFYN_LOCAL_VALIDATION === "1"
  )
    return true;
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Blog posts (future /blog/<slug>) are public too.
  if (pathname.startsWith("/blog/")) return true;
  // Auth callback + signout must work regardless of session state.
  if (pathname.startsWith("/auth/")) return true;
  // Unauthenticated health probe (also excluded from the matcher below).
  if (pathname === "/api/health") return true;
  return false;
}

function loginRequiredResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { detail: "Sign in to continue." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const loginUrl = request.nextUrl.clone();
  if (
    process.env.INFFYN_PREVIEW_MODE === "true" &&
    !parseAlphaPolicy(
      process.env.INFFYN_PRIVATE_ALPHA,
      process.env.INFFYN_ALPHA_USER_IDS,
      process.env.INFFYN_RELEASE_STAGE,
    ).enabled
  ) {
    loginUrl.pathname = "/review";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Refresh the Supabase session and return the (cookie-carrying) response plus
 * the resolved user. Only called when env is present.
 */
async function resolveSession(request: NextRequest, env: Env) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

export async function proxy(request: NextRequest) {
  const alpha = parseAlphaPolicy(
    process.env.INFFYN_PRIVATE_ALPHA,
    process.env.INFFYN_ALPHA_USER_IDS,
    process.env.INFFYN_RELEASE_STAGE,
  );
  if (
    alpha.enabled &&
    alphaRouteDisabled(request.nextUrl.pathname, request.method)
  )
    return NextResponse.json(
      {
        detail:
          "This action is unavailable in the private alpha. Use the monthly CSV workspace.",
      },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  // This fixed synthetic walkthrough never reads or refreshes a customer session.
  if (
    ["/demo/monthly", "/api/demo/company"].includes(request.nextUrl.pathname) ||
    PUBLIC_EXAMPLES.has(request.nextUrl.pathname)
  ) {
    return NextResponse.next({ request });
  }
  if (
    !alpha.enabled &&
    process.env.INFFYN_PREVIEW_MODE === "true" &&
    ["/login", "/invite", "/audit"].includes(request.nextUrl.pathname)
  ) {
    const target = request.nextUrl.clone();
    target.pathname = "/review";
    target.search = "";
    return NextResponse.redirect(target);
  }
  const { pathname } = request.nextUrl;
  const isPublic = isPublicRoute(pathname);
  const env = tryGetEnv();

  // ── Env missing: asymmetric handling, no session call needed ──────────────
  if (!env) {
    if (isPublic) {
      // Fail OPEN — public page serves without auth-aware features.
      return NextResponse.next({ request });
    }
    // Fail CLOSED — cannot establish a session, so refuse (Q3).
    return loginRequiredResponse(request);
  }

  // ── Public route with env present: best-effort session refresh ────────────
  // Try/catch is scoped to the PUBLIC path only (Q4). A misconfigured/
  // unreachable Supabase must not 5xx the public funnel; the protected path
  // below deliberately has no such catch and stays strict/fail-closed.
  if (isPublic) {
    try {
      const { response, user } = await resolveSession(request, env);
      if (user && pathname === "/login" && alphaUserAllowed(alpha, user)) {
        const appUrl = request.nextUrl.clone();
        appUrl.pathname = "/app";
        return NextResponse.redirect(appUrl);
      }
      return response;
    } catch {
      return NextResponse.next({ request });
    }
  }

  // ── Protected route with env present: strict, fail-closed ─────────────────
  const { response, user } = await resolveSession(request, env);
  if (!user) {
    return loginRequiredResponse(request);
  }
  if (!alphaUserAllowed(alpha, user)) {
    if (pathname.startsWith("/api/"))
      return NextResponse.json(
        { detail: "Private-alpha access required." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "?error=alpha_access_required";
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
