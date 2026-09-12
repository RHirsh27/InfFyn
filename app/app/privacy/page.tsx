import Link from "next/link";
import "@/components/audit/workspace.css";
export default function Privacy() {
  return (
    <div className="audit-shell">
      <main
        className="audit-content"
        style={{ maxWidth: 850, margin: "40px auto" }}
      >
        <Link href="/">InfFyn</Link>
        <h1>Your evidence and its retention</h1>
        <p>
          Anonymous cost previews expire after one hour. Authenticated source
          evidence is retained for 90 days. Saved reports and calculation traces
          are retained for 12 months. A trace can include normalized customer
          and workflow identifiers needed to explain a result.
        </p>
        <p>
          Use pseudonymous customer identifiers and exclude personal
          information, prompts, model responses and secrets from uploaded
          evidence. Stripe access supplies billing evidence; it does not
          authorize charges against your customers.
        </p>
        <p>
          Company membership controls access to financial records. Invitation
          administrators manage access grants and invitation metadata; that role
          alone does not give them access to company audits.
        </p>
        <p>
          Saved audits can be deleted from the workspace. Cancellation or
          revoked complimentary access does not extend the retention period or
          automatically delete a previously saved report.
        </p>
        <p role="status">
          The complete privacy notice, business identity, support contact and
          backup-deletion terms must be published before public customer intake.
          Public production release is pending these details.
        </p>
      </main>
    </div>
  );
}
