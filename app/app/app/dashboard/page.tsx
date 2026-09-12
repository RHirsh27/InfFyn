import { redirect } from "next/navigation";
import { resolveAppLandingState } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { theme } from "@/lib/theme";
import { AuditDashboard } from "./audit-dashboard";
import { releaseStage } from "@/lib/private-alpha";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (releaseStage() === "private_alpha") redirect("/app/monthly");
  const landing = await resolveAppLandingState();
  if (!landing) {
    redirect("/login");
  }
  if (landing.phase === "onboarding") {
    redirect("/app");
  }

  const active = landing.active;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div style={{ background: theme.color.bg, minHeight: "100vh" }}>
      <AuditDashboard tenantName={active.tenant.name} tenantId={active.tenant.id} userEmail={user?.email ?? ""} />
    </div>
  );
}
