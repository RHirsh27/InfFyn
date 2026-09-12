import { NextRequest, NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
const allowed = {
  GET: /^(audits|audits\/[0-9a-f-]+(?:\/evidence)?|billing|status)$/,
  POST: /^(audits|audits\/[0-9a-f-]+\/rerun|preview|previews\/claim)$/,
  DELETE: /^audits\/[0-9a-f-]+$/,
};
const monthlyAllowed: Record<string, RegExp> = {
  GET: /^monthly\/(workloads|reports|reports\/[0-9a-f-]+(?:\/evidence)?|performance|connections|imports|imports\/[0-9a-f-]+\/evidence|drafts\/\d{4}-(?:0[1-9]|1[0-2]))$/,
  PUT: /^monthly\/drafts\/\d{4}-(?:0[1-9]|1[0-2])$/,
  POST: /^monthly\/(workloads\/[0-9a-f-]+|reports|selection|adopt|prepare)$/,
  DELETE: /^monthly\/reports\/[0-9a-f-]+$/,
};
async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const disabled = alphaDisabledResponse("/api/validation/request", req.method);
  if (disabled) return disabled;
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.INFFYN_LOCAL_VALIDATION !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname)
  )
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  if (
    req.method !== "GET" &&
    req.headers.get("origin") !==
      `${req.nextUrl.protocol}//${req.headers.get("host")}`
  )
    return NextResponse.json({ detail: "Origin rejected" }, { status: 403 });
  const path = (await context.params).path.join("/");
  if (
    !(allowed as Record<string, RegExp>)[req.method]?.test(path) &&
    !monthlyAllowed[req.method]?.test(path)
  )
    return NextResponse.json(
      { detail: "Action is unavailable in validation." },
      { status: 404 },
    );
  try {
    const body = ["POST", "PUT"].includes(req.method) ? await req.text() : undefined;
    if (body && new TextEncoder().encode(body).length > 4_000_000)
      return NextResponse.json({ detail: "File too large" }, { status: 413 });
    const response = await fetch(`http://127.0.0.1:8012/v2/${path}`, {
      method: req.method,
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": "11111111-1111-4111-8111-111111111111",
      },
      cache: "no-store",
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Start the local validation engine on port 8012." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
