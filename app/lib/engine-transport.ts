import "server-only";

/** Deployment admission credential; never copy caller headers or expose it in URLs. */
export function engineServiceHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.delete("x-vercel-protection-bypass");
  const credential = process.env.ENGINE_PROTECTION_BYPASS;
  if (credential) headers.set("x-vercel-protection-bypass", credential);
  return headers;
}
