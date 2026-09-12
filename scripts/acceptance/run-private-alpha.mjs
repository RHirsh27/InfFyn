import { readFile, writeFile } from "node:fs/promises";
import { createPrivateAlphaTransport, runPrivateAlphaAcceptance } from "./private-alpha.mjs";

// Operator-injected environment only; no .env, browser store, CLI secret arguments,
// user creation, Supabase mutation, or automatic acceptance promotion.
let output;
try {
  const args = process.argv.slice(2);
  const allowed = new Set(["--execute", "--manifest", "--report"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error("unsupported argument");
    if (args[i] !== "--execute") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("missing argument"); i++; }
  }
  const arg = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const execute = args.includes("--execute");
  const manifest = arg("--manifest") ? JSON.parse(await readFile(arg("--manifest"), "utf8")) : null;
  const transport = execute ? createPrivateAlphaTransport(manifest) : undefined;
  output = await runPrivateAlphaAcceptance({ manifest, execute, transport });
  if (arg("--report")) await writeFile(arg("--report"), JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
  process.exitCode = output.outcome === "failed" ? 1 : execute ? 2 : 0;
} catch {
  output = { mode: "preflight", outcome: "pending", release_ready: false, reason: "Approved alpha manifest, externally supplied sessions, or output path unavailable. No acceptance claim is made." };
  process.exitCode = 2;
}
console.log(JSON.stringify(output, null, 2));
