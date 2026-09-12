import { NextResponse } from "next/server";
import { engineServiceHeaders } from "@/lib/engine-transport";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The only public company endpoint: a fixed, synthetic, read-only fixture.
// Never forward a caller's session, tenant, query, credential, or request body.
export async function GET() {
  try {
    const base = process.env.ENGINE_URL;
    if (!base) throw new Error("Unavailable");
    const target = new URL("/demo/company", base);
    if (
      target.username || target.password ||
      (target.protocol !== "https:" && !(
        process.env.NODE_ENV === "development" &&
        target.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
      ))
    ) throw new Error("Unavailable");
    const response = await fetch(target, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000),
      headers: engineServiceHeaders({ Accept: "application/json" }),
    });
    if (!response.ok || !response.body) throw new Error("Unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 3_800_000) {
          await reader.cancel();
          throw new Error("Unavailable");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.synthetic !== true) throw new Error("Unavailable");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300", "X-Robots-Tag": "noindex" },
    });
  } catch {
    return NextResponse.json(
      { detail: "The company demonstration is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
