import * as Sentry from "@sentry/nextjs";
import { scrubTelemetry } from "./lib/telemetry-privacy";

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    tracesSampleRate: 0,

    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    enableLogs: false,
    sendDefaultPii: false,
    beforeSend: scrubTelemetry,

  });
}

export const onRouterTransitionStart = dsn
  ? Sentry.captureRouterTransitionStart
  : () => {};
