import { readFile, writeFile } from "node:fs/promises";
import { createHostedTransport, loadSessions, runAcceptance, validateManifest } from "./hosted-monthly.mjs";

// Secrets are read only from externally populated environment variables. No .env
// autoloading, browser-store inspection, command-line secrets, or provider writes.
let output;
try {
  const args = process.argv.slice(2);
  const allowed = new Set(["--execute", "--manifest", "--report"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error("invalid argument");
    if (args[i] !== "--execute") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("missing argument"); i++; }
  }
  const execute = args.includes("--execute");
  const readArg = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const manifestPath = readArg("--manifest");
  const manifest = manifestPath ? JSON.parse(await readFile(manifestPath, "utf8")) : null;
  let transport, hasResume = false;
  if (execute) {
    validateManifest(manifest);
    const sessions = loadSessions(manifest);
    transport = createHostedTransport(manifest, sessions);
    hasResume = Boolean(sessions[0].resume);
  }
  output = await runAcceptance({ manifest, execute, transport, hasResume });
  if (readArg("--report")) await writeFile(readArg("--report"), JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
  process.exitCode = output.outcome === "failed" ? 1 : execute ? 2 : 0;
} catch {
  output = { mode: "preflight", outcome: "pending", release_ready: false, reason: "Manifest, fixture authorization, sessions, or output path unavailable. No readiness claim is made." };
  process.exitCode = 2;
}
console.log(JSON.stringify(output, null, 2));
