import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authReturnPath } from "@/lib/auth-return";
import { requireAlphaUser } from "@/lib/private-alpha";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next") ?? "/app/monthly";
  const next = authReturnPath(requested);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user)
        return NextResponse.redirect(
          `${origin}/login?error=auth_callback_failed`,
        );
      try {
        requireAlphaUser(user);
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(
          `${origin}/login?error=alpha_access_required`,
        );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
