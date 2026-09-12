-- E3.1: Ingest job tracking + tenant-scoped Storage bucket

-- ── ingest_jobs (idempotency + async status; service-role only) ─────────────

CREATE TABLE public.ingest_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  content_hash   TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  rows_ingested  INT NOT NULL DEFAULT 0,
  rows_rejected  INT NOT NULL DEFAULT 0,
  error_detail   JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  UNIQUE (tenant_id, content_hash)
);

CREATE INDEX ingest_jobs_tenant_id_idx ON public.ingest_jobs (tenant_id);

ALTER TABLE public.ingest_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_jobs FORCE ROW LEVEL SECURITY;
-- No policy: deny-by-default for app roles; engine uses service role.

REVOKE ALL ON public.ingest_jobs FROM anon, authenticated, public;

-- ── Storage bucket (private, tenant-prefixed paths) ───────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ingest', 'ingest', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY ingest_storage_insert_member ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ingest'
    AND (storage.foldername (name))[1] IN (
      SELECT tenant_id::text
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ingest_storage_select_member ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ingest'
    AND (storage.foldername (name))[1] IN (
      SELECT tenant_id::text
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ingest_storage_update_member ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ingest'
    AND (storage.foldername (name))[1] IN (
      SELECT tenant_id::text
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'ingest'
    AND (storage.foldername (name))[1] IN (
      SELECT tenant_id::text
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );
