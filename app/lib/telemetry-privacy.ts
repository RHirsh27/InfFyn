import type { ErrorEvent } from "@sentry/nextjs";

/** Finance evidence never belongs in telemetry. Retain error type and safe stacks. */
export function scrubTelemetry(event: ErrorEvent): ErrorEvent {
  const message =
    "Application error. Use the event ID and error type for diagnosis.";
  const values = (event.exception?.values || []).map((value) => {
    const frames = (value.stacktrace?.frames || []).map((frame) => ({
      filename: frame.filename?.split(/[?#]/, 1)[0],
      function: frame.function,
      lineno: frame.lineno,
      in_app: frame.in_app,
    }));
    return {
      type: value.type,
      value: message,
      ...(frames.length ? { stacktrace: { frames } } : {}),
    };
  });
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    message,
    ...(values.length ? { exception: { values } } : {}),
  };
}
