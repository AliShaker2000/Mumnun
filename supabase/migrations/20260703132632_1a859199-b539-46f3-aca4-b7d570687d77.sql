
-- Driver profiles: require driver role on insert
DROP POLICY IF EXISTS "Driver manages own profile" ON public.driver_profiles;
CREATE POLICY "Driver inserts own profile"
ON public.driver_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'driver'));

-- Worker profiles: require worker role on insert
DROP POLICY IF EXISTS "Worker manages own profile" ON public.worker_profiles;
CREATE POLICY "Worker inserts own profile"
ON public.worker_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'worker'));

-- Worker profiles: tighten SELECT (mirror driver_profiles)
DROP POLICY IF EXISTS "Worker profiles viewable by all" ON public.worker_profiles;
CREATE POLICY "Worker profile visible to owner, matched customers, and admins"
ON public.worker_profiles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.provider_id = worker_profiles.user_id
      AND sr.customer_id = auth.uid()
  )
);

-- Safe public summary view for worker discovery
CREATE OR REPLACE VIEW public.worker_public_stats
WITH (security_invoker = true) AS
SELECT user_id, level, rating_avg, ratings_count, available
FROM public.worker_profiles;

GRANT SELECT ON public.worker_public_stats TO authenticated, anon;
