import { AuditWorkspace } from "@/components/audit/workspace";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { releaseStage } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
export default async function AuditsPage() {
  if (releaseStage() === "private_alpha") redirect("/app/monthly");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/audits");
  return <AuditWorkspace hostedPreview={process.env.INFFYN_PREVIEW_MODE === "true"} />;
}
