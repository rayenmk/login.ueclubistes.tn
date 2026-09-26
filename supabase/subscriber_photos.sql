-- ============================================================
-- UE CLUBISTE - SUBSCRIBER PHOTO UPLOADS
-- Run in the Supabase SQL Editor.
-- Mirrors the match-logos storage setup so admins can upload a
-- member's photo as a file instead of pasting an external URL.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('subscriber-photos', 'subscriber-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS subscriber_photos_public_read ON storage.objects;
CREATE POLICY subscriber_photos_public_read
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'subscriber-photos');

DROP POLICY IF EXISTS subscriber_photos_admin_insert ON storage.objects;
CREATE POLICY subscriber_photos_admin_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'subscriber-photos' AND public.is_admin());

DROP POLICY IF EXISTS subscriber_photos_admin_update ON storage.objects;
CREATE POLICY subscriber_photos_admin_update
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'subscriber-photos' AND public.is_admin())
WITH CHECK (bucket_id = 'subscriber-photos' AND public.is_admin());

DROP POLICY IF EXISTS subscriber_photos_admin_delete ON storage.objects;
CREATE POLICY subscriber_photos_admin_delete
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'subscriber-photos' AND public.is_admin());
