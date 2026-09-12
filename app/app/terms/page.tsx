import Link from "next/link";
import "@/components/audit/workspace.css";
export default function Terms() {
  return (
    <div className="audit-shell">
      <main
        className="audit-content"
        style={{ maxWidth: 850, margin: "40px auto" }}
      >
        <Link href="/">InfFyn</Link>
        <h1>Service terms</h1>
        <p>
          The approved offer is $349 per company per month. Complimentary
          invitations provide full access until revoked and never start a paid
          subscription automatically.
        </p>
        <p>
          InfFyn calculates economics from supplied evidence and explicit
          assumptions. Revenue association does not establish causation. Modeled
          capacity value is not realized cash savings.
        </p>
        <p role="status">
          Final service terms are awaiting the operating business identity,
          support contact, refund and cancellation terms. Public production
          checkout remains a release prerequisite until these details are
          finalized.
        </p>
        <Link href="/privacy">Read the retention policy →</Link>
      </main>
    </div>
  );
}
