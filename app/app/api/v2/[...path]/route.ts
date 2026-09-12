import { NextRequest, NextResponse } from "next/server";
import { engineFetch } from "@/lib/engine";
import { ensureActiveTenant, setActiveTenantCookie } from "@/lib/tenant";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { AlphaAccessError, alphaDisabledResponse } from "@/lib/private-alpha";
import { engineServiceHeaders } from "@/lib/engine-transport";
import { reviewedImportPaths } from "@/lib/reviewed-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const rules: Record<string, RegExp> = {
  GET: /^(status|audits|audits\/[0-9a-f-]+(?:\/evidence)?|billing|access\/(admin|invitations))$/,
  POST: /^(preview|previews\/claim|audits|audits\/[0-9a-f-]+\/rerun|billing\/(checkout|portal)|stripe\/evidence|access\/(prepare|redeem|invitations|invitations\/[0-9a-f-]+\/revoke))$/,
  DELETE: /^audits\/[0-9a-f-]+$/,
};
const monthlyRules: Record<string, RegExp> = {
  GET: /^monthly\/(workloads|reports|reports\/[0-9a-f-]+(?:\/evidence)?|performance|connections|imports|imports\/[0-9a-f-]+\/evidence|drafts\/\d{4}-(?:0[1-9]|1[0-2]))$/,
  PUT: /^monthly\/drafts\/\d{4}-(?:0[1-9]|1[0-2])$/,
  POST: /^monthly\/(workloads\/[0-9a-f-]+|reports|selection|adopt|prepare|connections\/(openai|anthropic)|imports\/(openai|anthropic|stripe)|imports\/[0-9a-f-]+\/advance)$/,
  DELETE:
    /^monthly\/(reports\/[0-9a-f-]+|connections\/(openai|anthropic|stripe))$/,
};

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  const disabled = alphaDisabledResponse(`/api/v2/${path}`, request.method);
  if (disabled) return disabled;
  if (
    !rules[request.method]?.test(path) &&
    !monthlyRules[request.method]?.test(path) &&
    !reviewedImportPaths[request.method]?.test(path)
  )
    return NextResponse.json(
      { detail: "Unknown audit action." },
      { status: 404 },
    );
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !==
      `${request.nextUrl.protocol}//${request.headers.get("host")}`
  )
    return NextResponse.json(
      { detail: "Request origin does not match." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") || 0) > 4_000_000)
    return NextResponse.json(
      { detail: "Combined audit upload exceeds 4 MB." },
      { status: 413 },
    );
  try {
    let body = ["POST", "PUT"].includes(request.method)
      ? await request.text()
      : undefined;
    if (body && new TextEncoder().encode(body).length > 4_000_000)
      return NextResponse.json(
        { detail: "Combined audit upload exceeds 4 MB." },
        { status: 413 },
      );
    const jar = await cookies();
    if (path === "access/prepare") {
      let token: unknown;
      try {
        token = JSON.parse(body || "{}").token;
      } catch {
        return NextResponse.json(
          { detail: "Invalid invitation link." },
          { status: 400 },
        );
      }
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(token))
        return NextResponse.json(
          { detail: "Invalid invitation link." },
          { status: 400 },
        );
      jar.set("inffyn_invitation", token, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        maxAge: 604800,
        path: "/",
      });
      return NextResponse.json(
        { prepared: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (path === "access/redeem") {
      const token = jar.get("inffyn_invitation")?.value;
      if (!token)
        return NextResponse.json(
          { detail: "Open your invitation link first." },
          { status: 410 },
        );
      body = JSON.stringify({ token });
    }
    if (path === "previews/claim") {
      const token = jar.get("inffyn_preview")?.value;
      if (!token)
        return NextResponse.json(
          {
            detail:
              "No unclaimed preview remains. Upload your files to start a saved audit.",
          },
          { status: 410 },
        );
      body = JSON.stringify({ token });
    }
    const options: RequestInit = {
      method: request.method,
      body,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    };
    if (path === "preview") {
      const secret = process.env.AUDIT_PROXY_SECRET;
      if (!secret || secret.length < 32) throw new Error("Unavailable");
      // Vercel overwrites this header at its trusted edge. Never use client x-forwarded-for.
      const ip =
        process.env.VERCEL === "1"
          ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
          : "local-development";
      if (!ip) throw new Error("Unavailable");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const visitor = createHmac("sha256", secret)
        .update(`${Math.floor(Date.now() / 86400000)}:${ip}`)
        .digest("hex");
      options.headers = {
        ...options.headers,
        "x-inffyn-visitor": visitor,
        "x-inffyn-time": timestamp,
        "x-inffyn-signature": createHmac("sha256", secret)
          .update(`${timestamp}:${visitor}`)
          .digest("hex"),
      };
    }
    let response: Response;
    if (path === "preview" || path === "status") {
      const base = process.env.ENGINE_URL;
      if (!base) throw new Error("Unavailable");
      response = await fetch(base.replace(/\/$/, "") + "/v2/" + path, {
        ...options,
        headers: engineServiceHeaders(options.headers),
        redirect: "error",
      });
    } else if (path.startsWith("access/")) {
      response = await engineFetch("/v2/" + path, options);
    } else {
      const active = await ensureActiveTenant();
      const query = new URLSearchParams();
      if (reviewedImportPaths.GET.test(path)) {
        for (const key of ["month", "cursor", "confirmation_id"]) {
          const value = request.nextUrl.searchParams.get(key);
          if (value !== null) query.set(key, value);
        }
      }
      response = await engineFetch("/v2/" + path + (query.size ? `?${query}` : ""), {
        ...options,
        tenantId: active.tenant.id,
      });
    }
    const data = await response.json();
    if (path === "access/redeem" && response.ok) {
      await setActiveTenantCookie(data.tenant_id);
      jar.delete("inffyn_invitation");
    }
    if (path === "preview" && response.ok && data.claim_token) {
      jar.set("inffyn_preview", data.claim_token, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        maxAge: 3600,
        path: "/",
      });
      delete data.claim_token;
    }
    if (path === "previews/claim" && response.ok) jar.delete("inffyn_preview");
    return NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AlphaAccessError)
      return NextResponse.json(
        { detail: error.message },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(
      {
        detail:
          "The audit service is unavailable. Your last saved report is unchanged. Please retry.",
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
