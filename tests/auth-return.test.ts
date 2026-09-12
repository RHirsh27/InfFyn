import assert from "node:assert/strict";
import { authReturnPath } from "../app/lib/auth-return";
assert.equal(authReturnPath("/invite"), "/invite");
assert.equal(authReturnPath("/app/admin/access"), "/app/admin/access");
for (const path of [
  null,
  "https://evil.test",
  "//evil.test",
  "/invite?next=https://evil.test",
  "/invite#secret",
  "/app/../evil",
  "/app\\evil",
  "/app/%2f%2fevil.test",
])
  assert.equal(authReturnPath(path), "/app/monthly");
console.log("PASS invitation sign-in return and external redirect rejection");
