import { notFound } from "next/navigation";
import { PreviewEntry } from "@/components/access/preview-entry";
import { AuditWorkspace } from "@/components/audit/workspace";
import { releaseStage } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
export default function ReviewPage() {
  if (releaseStage() === "private_alpha") notFound();
  if (process.env.INFFYN_PREVIEW_MODE !== "true") notFound();
  if (process.env.INFFYN_PREVIEW_STORAGE === "browser")
    return <AuditWorkspace hostedPreview browserPreview />;
  return <PreviewEntry />;
}
