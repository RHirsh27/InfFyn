import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { engineServiceHeaders } from "@/lib/engine-transport";
import { scrubTelemetry } from "@/lib/telemetry-privacy";
import * as Sentry from "@sentry/nextjs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function run(request: NextRequest, action: "retention" | "monitoring") {
  const cron = process.env.CRON_SECRET;
  const incoming = request.headers.get("authorization") || "";
  const expected = `Bearer ${cron || ""}`;
  if (
    !cron ||
    cron.length < 32 ||
    Buffer.byteLength(incoming) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))
  )
    return reply({ detail: "Unauthorized" }, 401);
  const engine = process.env.ENGINE_URL,
    secret = process.env.MAINTENANCE_SECRET;
  if (
    process.env.INFFYN_PREVIEW_MODE === "true" ||
    !engine ||
    !secret ||
    secret.length < 32
  )
    return reply({ detail: "Maintenance is not configured." }, 503);
  try {
    const target = new URL(engine);
    if (
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      target.pathname !== "/"
    )
      return reply({ detail: "Maintenance destination is invalid." }, 503);
    if (
      process.env.INFFYN_RELEASE_STAGE === "private_alpha" &&
      target.origin !== "https://inffyn-engine-alpha.onrender.com"
    )
      return reply({ detail: "Maintenance destination is invalid." }, 503);
    const r = await fetch(
      target.origin +
        "/v2/maintenance" +
        (action === "monitoring" ? "/check" : ""),
      {
        method: "POST",
        headers: engineServiceHeaders({ Authorization: `Bearer ${secret}` }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(55000),
      },
    );
    if (!r.ok) {
      console.error("inffyn_maintenance_failed", { action, status: r.status });
      return reply(
        { detail: "Maintenance failed. Check sanitized service errors." },
        r.status,
      );
    }
    const result = await r.json();
    if (action === "monitoring") {
      const eventId = randomUUID().replaceAll("-", "");
      const event = scrubTelemetry({
        type: undefined,
        event_id: eventId,
        level: "error",
        platform: "javascript",
        exception: {
          values: [
            {
              type: "InfFynOperationalCheck",
              value: "SYNTHETIC_PRIVATE_EVIDENCE_MUST_BE_REMOVED",
            },
          ],
        },
        request: { data: "SYNTHETIC_PRIVATE_EVIDENCE_MUST_BE_REMOVED" },
      });
      console.error("inffyn_monitoring_check", JSON.stringify(event));
      const configured = !!(
        process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
      );
      if (configured) {
        Sentry.captureEvent(event);
        await Sentry.flush(5000);
      }
      return reply({
        app: {
          event_id: eventId,
          check: "synthetic_scrubbed_error",
          platform_log_emitted: true,
          external_monitor_configured: configured,
          external_delivery_verified: false,
        },
        engine: result,
      });
    }
    return reply(result);
  } catch {
    console.error("inffyn_maintenance_unavailable", { action });
    return reply({ detail: "Maintenance service unavailable." }, 503);
  }
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// Existing production cron contract. Preview is operated explicitly; its cron
// configuration must never be reported as an active scheduler.
export async function GET(request: NextRequest) {
  return run(request, "retention");
}

export async function POST(request: NextRequest) {
  const action = request.headers.get("x-inffyn-maintenance-action");
  if (action !== "retention" && action !== "monitoring")
    return reply({ detail: "Choose retention or monitoring." }, 400);
  return run(request, action);
}
