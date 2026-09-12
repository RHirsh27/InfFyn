import { AuditWorkspace } from "@/components/audit/workspace";
import { releaseStage } from "@/lib/private-alpha";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default function AuditPreviewPage() {
  if (releaseStage() === "private_alpha") notFound();
  return <AuditWorkspace publicPreview />;
}
