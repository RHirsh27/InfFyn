"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../audit/workspace.css";
type Invite = {
  id: string;
  email: string;
  company_name: string;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
};
export function AccessPortal() {
  const [items, setItems] = useState<Invite[]>([]),
    [email, setEmail] = useState(""),
    [company, setCompany] = useState(""),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [allowed, setAllowed] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null);
  async function api(path: string, body?: unknown) {
    const r = await fetch("/api/v2/access/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok)
      throw new Error(
        typeof d.detail === "string" ? d.detail : "Access action failed.",
      );
    return d;
  }
  async function refresh() {
    const d = await api("invitations");
    setItems(d.invitations);
  }
  useEffect(() => {
    api("admin")
      .then(async (d) => {
        setAllowed(d.is_admin);
        if (d.is_admin) await refresh();
        else setError("This portal is restricted to access administrators.");
      })
      .catch((e) => setError(e.message));
  }, []);
  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLink("");
    try {
      const d = await api("invitations", { email, company_name: company });
      setLink(d.url);
      setEmail("");
      setCompany("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to issue invitation.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`invitations/${id}/revoke`, {});
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to revoke access.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="audit-shell">
      <main
        className="audit-content"
        style={{ maxWidth: 1100, margin: "40px auto", width: "100%" }}
      >
        <Link href="/app/monthly">← Company workspace</Link>
        <p className="eyebrow">ACCESS ADMINISTRATION</p>
        <h1>Invite a company to InfFyn.</h1>
        <p>
          Complimentary full access, until revoked. No automatic billing. This
          portal does not expose company financial evidence.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {allowed && (
          <>
            <form className="paper" onSubmit={issue}>
              <div className="field-row">
                <label className="field">
                  Recipient email
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="field">
                  Company name
                  <input
                    required
                    maxLength={120}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </label>
              </div>
              <button className="primary" disabled={busy || !company.trim()}>
                Create invitation link →
              </button>
              <p className="small muted">
                The link expires in seven days if unused. Copy and share it with
                the named recipient; InfFyn does not send it automatically.
              </p>
            </form>
            {link && (
              <section className="paper" aria-label="New invitation">
                <h2>Your invitation link</h2>
                <p>This secret link is shown only now. Treat it as private.</p>
                <input
                  aria-label="Invitation link"
                  readOnly
                  value={link}
                  style={{ width: "100%" }}
                />
                <button
                  className="secondary"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(link)
                      .catch(() =>
                        setError("Copy the link from the field above."),
                      )
                  }
                >
                  Copy link
                </button>
              </section>
            )}
            <section className="paper">
              <h2>Invitations and complimentary access</h2>
              <p className="small muted">
                Most recent 200 invitations. Revocation stops new full audits;
                retained reports stay readable. A paid subscription remains
                independent.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company / recipient</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.company_name}
                          <br />
                          <span className="small muted">{i.email}</span>
                        </td>
                        <td>
                          {i.revoked_at
                            ? "Revoked"
                            : i.redeemed_at
                              ? "Complimentary · active"
                              : Date.parse(i.expires_at) < Date.now()
                                ? "Expired"
                                : "Awaiting acceptance"}
                        </td>
                        <td>{new Date(i.created_at).toLocaleDateString()}</td>
                        <td>
                          {!i.revoked_at &&
                            (confirm === i.id ? (
                              <>
                                <span>
                                  Revoke this invitation and its grant?
                                </span>
                                <button
                                  className="danger-button"
                                  disabled={busy}
                                  onClick={() => revoke(i.id)}
                                >
                                  Confirm revocation
                                </button>
                                <button onClick={() => setConfirm(null)}>
                                  Keep access
                                </button>
                              </>
                            ) : (
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => setConfirm(i.id)}
                              >
                                Revoke access
                              </button>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!items.length && <p>No invitations yet.</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
