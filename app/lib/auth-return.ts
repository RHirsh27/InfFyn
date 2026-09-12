/** Only known application destinations may survive the email sign-in round trip. */
export function authReturnPath(requested: string | null): string {
  if (requested === "/invite") return requested;
  return requested &&
    /^\/app(?:\/[a-zA-Z0-9/_-]*)?(?:\?[a-zA-Z0-9=&_-]*)?$/.test(requested)
    ? requested
    : "/app/monthly";
}
