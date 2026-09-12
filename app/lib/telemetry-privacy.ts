import type { ErrorEvent } from "@sentry/nextjs";

/** Finance evidence never belongs in telemetry. Retain error type and safe stacks. */
export function scrubTelemetry(event: ErrorEvent): ErrorEvent {
  const message =
    "Application error. Use the event ID and error type for diagnosis.";
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    message,
    exception: {
      values: (event.exception?.values || []).map((value) => ({
        type: value.type,
        value: message,
        stacktrace: {
          frames: (value.stacktrace?.frames || []).map((frame) => ({
            filename: frame.filename?.split(/[?#]/, 1)[0],
            function: frame.function,
            lineno: frame.lineno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}
