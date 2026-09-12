import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultTenantNameFromEmail, provisionTenant } from "@/lib/tenant";
import { AlphaAccessError } from "@/lib/private-alpha";

/** Manual tenant creation (secondary path). E6 auto-provision is the primary flow. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : defaultTenantNameFromEmail(user.email ?? undefined);

  try {
    const tenantId = await provisionTenant(supabase, name);
    return NextResponse.json({ tenantId });
  } catch (err) {
    if (err instanceof AlphaAccessError)
      return NextResponse.json({ error: err.message }, { status: 403 });
    const message =
      err instanceof Error ? err.message : "Failed to create tenant";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
