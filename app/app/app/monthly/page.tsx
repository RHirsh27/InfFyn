import { MonthlyWorkspace } from "@/components/monthly/workspace";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAlphaUser, releaseStage } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
export default async function MonthlyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/monthly");
  try {
    requireAlphaUser(user);
  } catch {
    redirect("/login?error=alpha_access_required");
  }
  return <MonthlyWorkspace privateAlpha={releaseStage() === "private_alpha"} />;
}
