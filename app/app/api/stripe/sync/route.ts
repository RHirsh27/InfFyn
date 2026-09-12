import { NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { engineFetch } from "@/lib/engine";
import { ensureActiveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const disabled = alphaDisabledResponse("/api/stripe/sync", "POST");
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

  const { searchParams } = new URL(request.url);
  const background = searchParams.get("background") ?? "true";

  let engineResponse: Response;
  try {
    engineResponse = await engineFetch(`/stripe/sync?background=${background}`, {
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
