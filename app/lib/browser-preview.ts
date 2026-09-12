import type { AuditInput, SavedAudit } from "./audit-v2";
type LocalAudit = SavedAudit & {
  fingerprint: string;
  payload: AuditInput | null;
};
function present(record: LocalAudit) {
  const { payload, ...audit } = record;
  return audit;
}
let opening: Promise<IDBDatabase> | null = null;
function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("inffyn-review-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("audits", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(
        new Error(
          "Browser storage is unavailable. Use a regular browser window to save this preview.",
        ),
      );
    };
  });
  return opening;
}
async function records(): Promise<LocalAudit[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("audits").objectStore("audits").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Unable to read this browser’s saved audits."));
  });
}
async function write(record: LocalAudit | string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("audits", "readwrite"),
      store = tx.objectStore("audits");
    if (typeof record === "string") store.delete(record);
    else store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error(
          "This browser could not save the audit. Free storage or export and remove older previews.",
        ),
      );
    tx.onabort = () =>
      reject(
        new Error("Browser storage did not save the audit. Please retry."),
      );
  });
}
async function retained() {
  const items = await records(),
    now = Date.now();
  for (const item of items) {
    if (Date.parse(item.report_expires_at) <= now) await write(item.id);
    else if (item.payload && Date.parse(item.evidence_expires_at) <= now) {
      item.payload = null;
      await write(item);
    }
  }
  return items
    .filter((item) => Date.parse(item.report_expires_at) > now)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Same workspace operations, with explicitly browser-owned persistence and no invented company.
export async function browserPreviewRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<any> {
  if (path === "billing")
    return {
      status: "preview",
      entitled: true,
      access_source: "preview",
      complimentary: false,
      is_owner: true,
      is_access_admin: false,
      has_customer: false,
      available: true,
      billing_available: false,
      monthly_price_usd: null,
      current_period_end: null,
      cancel_at_period_end: false,
    };
  const items = await retained();
  if (path === "audits" && method === "GET")
    return {
      audits: items.map(({ payload, result, report, ...item }) => item),
    };
  if (path === "audits" && method === "POST") {
    const response = await fetch("/api/review/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data.detail;
      throw new Error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item: { msg: string }) => item.msg).join(". ")
            : detail?.message || "Calculation failed. Check the input files.",
      );
    }
    const existing = items.find(
      (item) => item.fingerprint === data.fingerprint,
    );
    if (existing) return present(existing);
    if (items.length >= 20)
      throw new Error(
        "This preview holds up to 20 saved audits per browser. Export and remove an older audit before saving another.",
      );
    await write({ ...data, payload: body as AuditInput });
    return data;
  }
  const match = /^audits\/([0-9a-f-]+)(?:\/(evidence|rerun))?$/.exec(path);
  const found = match && items.find((item) => item.id === match[1]);
  if (!found)
    throw new Error(
      "Audit not found in this browser. Open the preview in the browser where you saved it.",
    );
  if (method === "DELETE") {
    await write(found.id);
    return { deleted: true };
  }
  if (match?.[2] === "evidence") {
    if (!found.payload)
      throw new Error(
        "The source retention period has ended. Your report remains available.",
      );
    return { payload: found.payload };
  }
  if (match?.[2] === "rerun") {
    if (!found.payload)
      throw new Error("The source retention period has ended.");
    return browserPreviewRequest("audits", "POST", found.payload);
  }
  return present(found);
}
