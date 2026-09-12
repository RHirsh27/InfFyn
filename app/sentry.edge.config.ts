import * as Sentry from "@sentry/nextjs";
import { scrubTelemetry } from "./lib/telemetry-privacy";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    tracesSampleRate: 0,

    enableLogs: false,
    sendDefaultPii: false,
    beforeSend: scrubTelemetry,
  });
}
