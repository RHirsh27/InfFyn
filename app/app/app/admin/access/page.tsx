import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessPortal } from "@/components/access/portal";
import { requireAlphaUser } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
export default async function AccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/admin/access");
  try {
    requireAlphaUser(user);
  } catch {
    redirect("/login?error=alpha_access_required");
  }
  return <AccessPortal />;
}
