import { NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveTenant } from "@/lib/tenant";
import { engineFetch } from "@/lib/engine";

/**
 * Trigger a fresh audit computation for the active tenant. Presentation-only
 * proxy to the E4 engine endpoint; no allocation logic lives here.
 */
export async function POST() {
  const disabled = alphaDisabledResponse("/api/audit/run", "POST");
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

  let engineResponse: Response;
  try {
    engineResponse = await engineFetch("/audit/run", {
      method: "POST",
      tenantId: active.tenant.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Engine request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const payload = await engineResponse.json().catch(() => ({}));
  return NextResponse.json(payload, { status: engineResponse.status });
}
