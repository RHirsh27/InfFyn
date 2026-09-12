import { NextRequest, NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { engineServiceHeaders } from "@/lib/engine-transport";
import { createHmac } from "node:crypto";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const disabled = alphaDisabledResponse("/api/review/calculate", "POST");
  if (disabled) return disabled;
  if (
    process.env.INFFYN_PREVIEW_MODE !== "true" ||
    process.env.INFFYN_PREVIEW_STORAGE !== "browser"
  )
    return NextResponse.json({ detail: "Not available." }, { status: 404 });
  if (
    request.headers.get("origin") !==
    `${request.nextUrl.protocol}//${request.headers.get("host")}`
  )
    return NextResponse.json(
      { detail: "Origin does not match." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") || 0) > 4_000_000)
    return NextResponse.json(
      { detail: "Combined upload exceeds 4 MB." },
      { status: 413 },
    );
  try {
    const secret = process.env.AUDIT_PROXY_SECRET,
      base = process.env.ENGINE_URL;
    if (!secret || secret.length < 32 || !base) throw new Error("Unavailable");
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 4_000_000)
      return NextResponse.json(
        { detail: "Combined upload exceeds 4 MB." },
        { status: 413 },
      );
    const ip =
      process.env.VERCEL === "1"
        ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
        : "local-development";
    if (!ip) throw new Error("Unavailable");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const visitor = createHmac("sha256", secret)
      .update(`${Math.floor(Date.now() / 86400000)}:${ip}`)
      .digest("hex");
    const response = await fetch(
      base.replace(/\/$/, "") + "/v2/review/calculate",
      {
        method: "POST",
        body,
        headers: engineServiceHeaders({
          "Content-Type": "application/json",
          "x-inffyn-visitor": visitor,
          "x-inffyn-time": timestamp,
          "x-inffyn-signature": createHmac("sha256", secret)
            .update(`${timestamp}:${visitor}`)
            .digest("hex"),
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(55000),
      },
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        detail:
          "The calculation service is unavailable. Your browser's saved audits are unchanged.",
      },
      { status: 503 },
    );
  }
}
