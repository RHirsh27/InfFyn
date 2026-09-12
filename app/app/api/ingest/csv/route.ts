import { NextResponse } from "next/server";
import { alphaDisabledResponse } from "@/lib/private-alpha";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveTenant } from "@/lib/tenant";
import { engineFetch } from "@/lib/engine";

const BUCKET = "ingest";
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const disabled = alphaDisabledResponse("/api/ingest/csv", "POST");
  if (disabled) return disabled;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let active;
  try {
    active = await ensureActiveTenant();
  } catch {
    return NextResponse.json({ error: "Failed to provision workspace" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only CSV files are accepted" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 50MB limit" }, { status: 400 });
  }

  const storagePath = `${active.tenant.id}/uploads/${randomUUID()}.csv`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "text/csv",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  let engineResponse: Response;
  try {
    engineResponse = await engineFetch("/ingest/csv", {
      method: "POST",
      tenantId: active.tenant.id,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_path: storagePath }),
    });
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    const message = err instanceof Error ? err.message : "Engine request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const payload = await engineResponse.json().catch(() => ({}));

  if (!engineResponse.ok) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(payload, { status: engineResponse.status });
  }

  return NextResponse.json({ ...payload, storage_path: storagePath });
}
