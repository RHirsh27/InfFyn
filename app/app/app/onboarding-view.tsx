"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Membership, Tenant } from "@inffyn/types";
import { theme } from "@/lib/theme";
import { CsvUploadForm } from "./csv-upload-form";
import { StripeConnectForm } from "./stripe-connect-form";
import { TenantSwitcher } from "./tenant-switcher";
import { Button } from "./dashboard/ui";

export function OnboardingView({
  userEmail,
  tenant,
  memberships,
  activeTenantId,
}: {
  userEmail: string;
  tenant: Tenant | null;
  memberships?: Membership[];
  activeTenantId?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runFirstAudit() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/audit/run", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail ?? body.error ?? `Audit failed (${res.status})`);
      }
      router.push("/app/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: `${theme.space(8)} ${theme.space(4)}`,
        fontFamily: theme.font.body,
        color: theme.color.text,
        minHeight: "100vh",
      }}
    >
      <h1 style={{ margin: 0, fontSize: theme.fontSize.xxl }}>Run your free audit</h1>
      <p style={{ color: theme.color.textMuted, marginTop: theme.space(2) }}>
        Signed in as {userEmail}. Upload usage or connect Stripe — your account is created when you
        start, not as a separate step.
      </p>
      {tenant && (
        <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
          Workspace: <strong style={{ color: theme.color.text }}>{tenant.name}</strong>
        </p>
      )}

      {memberships && memberships.length > 1 && activeTenantId && (
        <TenantSwitcher memberships={memberships} activeTenantId={activeTenantId} />
      )}

      <CsvUploadForm onSuccess={() => router.refresh()} />
      <StripeConnectForm tenantId={tenant?.id} />

      <section
        style={{
          marginTop: theme.space(6),
          padding: theme.space(5),
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.color.border}`,
          background: theme.color.surface,
        }}
      >
        <h2 style={{ margin: 0, fontSize: theme.fontSize.lg }}>Ready to see your margin?</h2>
        <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
          After you upload usage (and optionally connect revenue), run the audit. Your result is saved
          to your account automatically.
        </p>
        <Button onClick={runFirstAudit} disabled={running}>
          {running ? "Running audit…" : "Run audit"}
        </Button>
        {error && (
          <p style={{ color: theme.color.danger, marginTop: theme.space(2), fontSize: theme.fontSize.sm }}>
            {error}
          </p>
        )}
      </section>

      <form action="/auth/signout" method="post" style={{ marginTop: theme.space(6) }}>
        <button
          type="submit"
          style={{
            background: "transparent",
            border: `1px solid ${theme.color.border}`,
            color: theme.color.textMuted,
            padding: `${theme.space(2)} ${theme.space(4)}`,
            borderRadius: theme.radius.md,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
