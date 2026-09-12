import { createClient } from "@/lib/supabase/server";
import { alphaDisabledResponse, requireAlphaUser } from "./private-alpha";
import { engineServiceHeaders } from "./engine-transport";

function engineBaseUrl(): string {
  const url = process.env.ENGINE_URL ?? process.env.NEXT_PUBLIC_ENGINE_URL;
  if (!url) {
    throw new Error("ENGINE_URL is not configured");
  }
  return url.replace(/\/$/, "");
}

/**
 * Authenticated engine fetch — attaches Bearer token from Supabase session.
 * tenantId is forwarded as X-Tenant-Id; user identity comes from the JWT only.
 */
export async function engineFetch(
  path: string,
  options: RequestInit & { tenantId?: string } = {},
): Promise<Response> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const disabled = alphaDisabledResponse(
    `/api${normalized}`,
    options.method || "GET",
  );
  if (disabled) return disabled;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated");
  requireAlphaUser(user);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated — no Supabase session");
  }

  const { tenantId, headers: initHeaders, ...rest } = options;
  const headers = engineServiceHeaders(initHeaders);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (tenantId) {
    headers.set("X-Tenant-Id", tenantId);
  }

  return fetch(
    `${engineBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`,
    {
      ...rest,
      headers,
      redirect: "error",
    },
  );
}
