import { NextResponse } from "next/server";
import { releaseStage } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { status: "ok", release_stage: releaseStage() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
