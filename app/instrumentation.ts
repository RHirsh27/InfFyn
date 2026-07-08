export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("./lib/sentry");
    initSentry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { initSentry } = await import("./lib/sentry");
    initSentry();
  }
}
