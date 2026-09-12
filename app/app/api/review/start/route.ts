import { NextRequest, NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const disabled = alphaDisabledResponse("/api/review/start", "POST");
  if (disabled) return disabled;
  if (process.env.INFFYN_PREVIEW_MODE !== "true")
    return NextResponse.json({ detail: "Not available." }, { status: 404 });
  if (
    request.headers.get("origin") !==
    `${request.nextUrl.protocol}//${request.headers.get("host")}`
  )
    return NextResponse.json(
      { detail: "Origin does not match." },
      { status: 403 },
    );
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error)
        return NextResponse.json(
          { detail: "Preview sign-in unavailable." },
          { status: 503 },
        );
    }
    return NextResponse.json(
      { ready: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { detail: "Preview sign-in unavailable." },
      { status: 503 },
    );
  }
}
