import { AuditWorkspace } from "@/components/audit/workspace";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
export const dynamic = "force-dynamic";
export default async function ValidationPage() {
  const host = (await headers()).get("host") || "";
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.INFFYN_LOCAL_VALIDATION !== "1" ||
    !/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(host)
  )
    notFound();
  return <AuditWorkspace validation />;
}
