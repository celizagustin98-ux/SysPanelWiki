
CREATE POLICY "instructivos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'instructivos');
CREATE POLICY "instructivos upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'instructivos' AND public.can_write(auth.uid()));
CREATE POLICY "instructivos delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'instructivos' AND public.can_write(auth.uid()));
