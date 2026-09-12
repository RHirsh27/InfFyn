import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { cookies } from "next/headers";
import { AlphaAccessError, requireAlphaUser } from "@/lib/private-alpha";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    requireAlphaUser(user);
  } catch (error) {
    if (error instanceof AlphaAccessError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const { tenantId } = await request.json();
  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json(
      { error: "tenantId is required" },
      { status: 400 },
    );
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
