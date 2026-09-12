const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  sentryDsn: string | undefined;
};

let cached: Env | null = null;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key]!.trim() === ""
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

/** Lazy env access — validates at runtime, not during static prerender/build. */
export function getEnv(): Env {
  if (!cached) {
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    const missing = REQUIRED_ENV_VARS.filter(
      (key) => !process.env[key] || process.env[key]!.trim() === ""
    );

    if (missing.length > 0 && !isBuildPhase) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`
      );
    }

    cached = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      sentryDsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    };
  }
  return cached;
}

/**
 * Non-throwing env accessor for the middleware ONLY.
 *
 * Returns the resolved env, or `null` when the required Supabase vars are
 * missing/empty — instead of throwing like `getEnv()`. This lets the
 * middleware fail OPEN on public routes (serve without auth-aware features)
 * and fail CLOSED on protected routes (redirect to /login), rather than 5xx
 * the whole site on a config slip.
 *
 * The strict `getEnv()` above is intentionally left unchanged: server
 * components and API handlers that should hard-fail loudly still do.
 */
export function tryGetEnv(): Env | null {
  const missing = REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key]!.trim() === ""
  );
  if (missing.length > 0) {
    return null;
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    sentryDsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  };
}
