import { MonthlyWorkspace } from "@/components/monthly/workspace";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const host = (await headers()).get("host") || "";
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.INFFYN_LOCAL_VALIDATION !== "1" ||
    !/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(host)
  )
    notFound();
  return <MonthlyWorkspace validation />;
}
