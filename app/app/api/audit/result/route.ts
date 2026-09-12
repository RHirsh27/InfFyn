import { NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveTenant } from "@/lib/tenant";
import { engineFetch } from "@/lib/engine";

/**
 * Tier-gated audit result proxy. The engine performs the entitlement
 * projection (free vs full); the app only ever forwards what the engine
 * returns. The app never reads the raw audit_runs.result for a free user.
 */
export async function GET(request: Request) {
  const disabled = alphaDisabledResponse("/api/audit/result", "GET");
  if (disabled) return disabled;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let active;
  try {
    active = await ensureActiveTenant();
  } catch {
    return NextResponse.json({ error: "Failed to provision workspace" }, { status: 500 });
  }

  const runId = new URL(request.url).searchParams.get("run_id");
  const path = runId ? `/audit/result?run_id=${encodeURIComponent(runId)}` : "/audit/result";

  let engineResponse: Response;
  try {
    engineResponse = await engineFetch(path, {
      method: "GET",
      tenantId: active.tenant.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Engine request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const payload = await engineResponse.json().catch(() => ({}));
  return NextResponse.json(payload, { status: engineResponse.status });
}
