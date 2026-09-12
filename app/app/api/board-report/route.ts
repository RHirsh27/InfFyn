import { NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { engineFetch } from "@/lib/engine";
import { ensureActiveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";

// Generate the AI board report for the caller's active tenant. The Anthropic key
// lives only on the engine — the browser never sees it; this route just proxies.
export async function POST() {
  const disabled = alphaDisabledResponse("/api/board-report", "POST");
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
    engineResponse = await engineFetch("/board-report", {
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
