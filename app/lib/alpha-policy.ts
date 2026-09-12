import { reviewedImportPaths } from "./reviewed-import";
/** Pure policy. Call only with server configuration and a verified Auth user. */
export type AlphaPolicy = {
  enabled: boolean;
  valid: boolean;
  userIds: ReadonlySet<string>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAlphaPolicy(
  flag: string | undefined,
  ids: string | undefined,
  stage?: string,
): AlphaPolicy {
  const stageValid =
    stage === undefined ||
    stage === "" ||
    stage === "standard" ||
    stage === "private_alpha";
  if (
    stageValid &&
    stage !== "private_alpha" &&
    (flag === undefined || flag === "" || flag === "false")
  )
    return { enabled: false, valid: true, userIds: new Set() };
  const entries = (ids || "").split(",").map((id) => id.trim());
  const valid =
    stageValid &&
    flag === "true" &&
    entries.length > 0 &&
    entries.every((id) => uuid.test(id));
  return {
    enabled: true,
    valid,
    userIds: new Set(valid ? entries.map((id) => id.toLowerCase()) : []),
  };
}

export function alphaUserAllowed(
  policy: AlphaPolicy,
  user: {
    id: string;
    is_anonymous?: boolean;
    email_confirmed_at?: string;
  } | null,
): boolean {
  if (!policy.enabled) return true;
  return (
    policy.valid &&
    !!user &&
    user.is_anonymous === false &&
    !!user.email_confirmed_at &&
    policy.userIds.has(user.id.toLowerCase())
  );
}

/** Alpha exposes the reviewed monthly flow only; unknown financial actions fail closed. */
export function alphaV2ActionAllowed(path: string, method: string): boolean {
  if (reviewedImportPaths[method]?.test(path)) return true;
  if (
    method === "GET" &&
    /^(status|billing|access\/(admin|invitations))$/.test(path)
  )
    return true;
  if (
    method === "POST" &&
    /^access\/(prepare|redeem|invitations|invitations\/[0-9a-f-]+\/revoke)$/.test(
      path,
    )
  )
    return true;
  if (
    method === "GET" &&
    /^monthly\/(workloads|reports|reports\/[0-9a-f-]+(?:\/evidence)?|performance|connections|imports|drafts\/\d{4}-(?:0[1-9]|1[0-2]))$/.test(
      path,
    )
  )
    return true;
  if (
    method === "PUT" &&
    /^monthly\/drafts\/\d{4}-(?:0[1-9]|1[0-2])$/.test(path)
  )
    return true;
  if (
    method === "POST" &&
    /^monthly\/(workloads\/[0-9a-f-]+|reports|prepare|selection)$/.test(path)
  )
    return true;
  return method === "DELETE" && /^monthly\/reports\/[0-9a-f-]+$/.test(path);
}

export function alphaRouteDisabled(pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/v2/"))
    return !alphaV2ActionAllowed(pathname.slice(8), method);
  return (
    ["/review", "/audit", "/validation", "/app/audits", "/app/dashboard"].some(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ) ||
    [
      "/api/review/",
      "/api/validation/",
      "/api/stripe/",
      "/api/ingest/",
      "/api/audit/",
    ].some((path) => pathname.startsWith(path)) ||
    pathname === "/api/board-report"
  );
}
