import { AuditHome } from "@/components/audit/home";
import { releaseStage } from "@/lib/private-alpha";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  if (releaseStage() === "private_alpha") redirect("/app/monthly");
  return (
    <AuditHome hostedPreview={process.env.INFFYN_PREVIEW_MODE === "true"} />
  );
}
