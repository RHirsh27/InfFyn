DROP POLICY IF EXISTS ingest_storage_update_member ON storage.objects;
DROP POLICY IF EXISTS ingest_storage_select_member ON storage.objects;
DROP POLICY IF EXISTS ingest_storage_insert_member ON storage.objects;

DELETE FROM storage.objects WHERE bucket_id = 'ingest';
DELETE FROM storage.buckets WHERE id = 'ingest';

DROP TABLE IF EXISTS public.ingest_jobs;
