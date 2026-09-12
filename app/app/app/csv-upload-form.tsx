"use client";

import { useRef, useState } from "react";
import { theme } from "@/lib/theme";

type IngestResult = {
  job_id?: string;
  status?: string;
  rows_ingested?: number;
  error?: string;
  detail?: { errors?: string[] };
  errors?: string[];
};

function isCsv(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" || // some browsers label .csv this way
    file.type === "application/csv"
  );
}

export function CsvUploadForm({ onSuccess }: { onSuccess?: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Selection (drag OR browse) — no change to how the file is later ingested ---
  function selectFile(f: File | undefined | null) {
    if (!f) return;
    if (!isCsv(f)) {
      setFile(null);
      setError(`"${f.name}" isn't a CSV. Please choose a .csv file.`);
      setStatus(null);
      setJobId(null);
      return;
    }
    setFile(f);
    setError(null);
    setStatus(null);
    setJobId(null);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    selectFile(e.dataTransfer.files?.[0]);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // only clear when leaving the zone itself, not a child element
    if (e.currentTarget === e.target) setDragActive(false);
  }

  function openBrowse() {
    inputRef.current?.click();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openBrowse();
    }
  }

  // --- Ingestion (unchanged: same endpoint, same polling, same messages) ---
  async function pollJob(id: string) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`/api/ingest/jobs/${id}`);
      const data = (await res.json()) as IngestResult & {
        status: string;
        rows_ingested: number;
        error_detail?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to poll job");
        return;
      }
      if (data.status === "completed") {
        setStatus(`Ingested ${data.rows_ingested} usage event rows`);
        onSuccess?.();
        return;
      }
      if (data.status === "failed") {
        setError((data.error_detail ?? ["Ingest failed"]).join("; "));
        return;
      }
    }
    setError("Timed out waiting for ingest job");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setError(null);
    setJobId(null);

    if (!file) {
      setError("Select a CSV file");
      return;
    }

    const body = new FormData();
    body.append("file", file);

    setUploading(true);
    setStatus("Uploading…");
    try {
      const res = await fetch("/api/ingest/csv", { method: "POST", body });
      const data = (await res.json()) as IngestResult;

      if (!res.ok) {
        const errors =
          data.detail?.errors ?? data.errors ?? (data.error ? [data.error] : ["Upload failed"]);
        setError(errors.join("; "));
        setStatus(null);
        return;
      }

      if (data.job_id) {
        setJobId(data.job_id);
        if (data.status === "completed") {
          setStatus(`Ingested ${data.rows_ingested ?? 0} usage event rows (duplicate file — no-op)`);
          onSuccess?.();
          return;
        }
        setStatus("Processing…");
        await pollJob(data.job_id);
      }
    } finally {
      setUploading(false);
    }
  }

  const zoneBorder = dragActive ? theme.color.accent : theme.color.border;
  const zoneBg = dragActive ? theme.color.surfaceAlt : theme.color.surface;

  return (
    <section style={{ marginTop: theme.space(6), paddingTop: theme.space(5), borderTop: `1px solid ${theme.color.border}` }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.csvup-zone{transition:border-color .15s ease, background .15s ease, box-shadow .15s ease;}
.csvup-zone:hover{border-color:${theme.color.text};}
.csvup-zone:focus-visible{outline:2px solid ${theme.color.accent};outline-offset:2px;}
@media (prefers-reduced-motion: reduce){.csvup-zone{transition:none;}}
`,
        }}
      />

      <h2 style={{ margin: `0 0 ${theme.space(3)}`, fontFamily: theme.font.display, fontWeight: 600, fontSize: theme.fontSize.lg, color: theme.color.text }}>
        Upload token usage CSV
      </h2>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: theme.space(3), alignItems: "stretch" }}>
        {/* Drop zone — drag a CSV here OR click to browse */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a CSV: drag a file here or press Enter to browse"
          onClick={openBrowse}
          onKeyDown={onKeyDown}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          className="csvup-zone"
          style={{
            border: `2px dashed ${zoneBorder}`,
            background: zoneBg,
            borderRadius: theme.radius.lg,
            padding: `${theme.space(8)} ${theme.space(5)}`,
            textAlign: "center",
            cursor: "pointer",
            boxShadow: dragActive ? `0 0 0 4px ${theme.color.surfaceAlt}` : "none",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              fontFamily: theme.font.mono,
              fontSize: theme.fontSize.xs,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.color.textMuted,
              marginBottom: theme.space(2),
            }}
          >
            {dragActive ? "Drop to attach" : "CSV"}
          </div>
          <div style={{ fontFamily: theme.font.body, fontSize: theme.fontSize.md, color: theme.color.text, fontWeight: 500 }}>
            {dragActive ? "Release your CSV file" : "Drag a CSV here, or "}
            {!dragActive && (
              <span style={{ color: theme.color.text, textDecoration: "underline", textUnderlineOffset: "3px" }}>
                click to browse
              </span>
            )}
          </div>
          <div style={{ marginTop: theme.space(2), fontSize: theme.fontSize.xs, color: theme.color.textMuted, fontFamily: theme.font.mono }}>
            token usage export · .csv
          </div>

          {file && (
            <div
              style={{
                marginTop: theme.space(4),
                display: "inline-flex",
                alignItems: "center",
                gap: theme.space(2),
                background: theme.color.surface,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.md,
                padding: `${theme.space(1)} ${theme.space(3)}`,
                fontFamily: theme.font.mono,
                fontSize: theme.fontSize.sm,
                color: theme.color.text,
              }}
            >
              <span aria-hidden="true">▸</span>
              <span>{file.name}</span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".csv,text/csv"
            onChange={(e) => selectFile(e.target.files?.[0])}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: theme.space(2), alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={!file || uploading}
            style={{
              background: theme.color.accent,
              color: theme.color.accentText,
              border: "none",
              borderRadius: theme.radius.md,
              padding: `${theme.space(2)} ${theme.space(4)}`,
              fontSize: theme.fontSize.sm,
              fontWeight: 600,
              fontFamily: theme.font.body,
              cursor: !file || uploading ? "not-allowed" : "pointer",
              opacity: !file || uploading ? 0.55 : 1,
            }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {file && !uploading && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setError(null);
                setStatus(null);
                setJobId(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              style={{
                background: "transparent",
                border: "none",
                color: theme.color.textMuted,
                fontSize: theme.fontSize.sm,
                fontFamily: theme.font.body,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {status && (
        <p
          role="status"
          style={{
            marginTop: theme.space(3),
            fontSize: theme.fontSize.sm,
            color: theme.color.text,
            background: theme.color.surfaceAlt,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            padding: `${theme.space(2)} ${theme.space(3)}`,
          }}
        >
          {status}
        </p>
      )}
      {error && (
        <p role="alert" style={{ marginTop: theme.space(3), fontSize: theme.fontSize.sm, color: theme.color.danger }}>
          {error}
        </p>
      )}
      {jobId && (
        <p style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted, fontFamily: theme.font.mono, marginTop: theme.space(2) }}>
          Job: {jobId}
        </p>
      )}
    </section>
  );
}
