import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { engineServiceHeaders } from "@/lib/engine-transport";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const incoming = request.headers.get("authorization") || "";
  const expected = `Bearer ${cron || ""}`;
  if (
    !cron ||
    cron.length < 32 ||
    Buffer.byteLength(incoming) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))
  )
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const engine = process.env.ENGINE_URL,
    secret = process.env.MAINTENANCE_SECRET;
  if (process.env.INFFYN_PREVIEW_MODE === "true" || !engine || !secret)
    return NextResponse.json(
      { detail: "Production maintenance is not configured." },
      { status: 503 },
    );
  try {
    const r = await fetch(engine.replace(/\/$/, "") + "/v2/maintenance", {
      method: "POST",
      headers: engineServiceHeaders({ Authorization: `Bearer ${secret}` }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    return NextResponse.json(
      r.ok
        ? await r.json()
        : { detail: "Retention sweep failed. Check sanitized service errors." },
      { status: r.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { detail: "Retention service unavailable." },
      { status: 503 },
    );
  }
}
