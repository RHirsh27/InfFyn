import assert from "node:assert/strict";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubTelemetry } from "../app/lib/telemetry-privacy";
const secret = "synthetic-private-evidence";
const input = {
  event_id: "known-event",
  level: "error",
  message: secret,
  request: { headers: { Authorization: secret } },
  extra: { body: secret },
  contexts: { provider: { value: secret } },
  breadcrumbs: [{ message: secret }],
  transaction: secret,
  exception: {
    values: [
      {
        type: "Error",
        value: secret,
        stacktrace: {
          frames: [
            {
              filename: `app.js?credential=${secret}`,
              function: "runImport",
              lineno: 1,
              vars: { credential: secret },
              pre_context: [secret],
            },
          ],
        },
      },
    ],
  },
} as ErrorEvent;
const result = scrubTelemetry(input);
assert.ok(!JSON.stringify(result).includes(secret));
assert.equal(result.event_id, "known-event");
assert.equal(
  result.exception?.values?.[0].stacktrace?.frames?.[0].function,
  "runImport",
);
console.log("PASS finance evidence and credentials excluded from telemetry");
