
DROP POLICY IF EXISTS "Driver profiles viewable by all" ON public.driver_profiles;

CREATE POLICY "Driver profile visible to owner, matched customers, and admins"
ON public.driver_profiles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.provider_id = driver_profiles.user_id
      AND sr.customer_id = auth.uid()
  )
);

CREATE OR REPLACE VIEW public.driver_public_stats
WITH (security_invoker = true) AS
SELECT user_id, vehicle_category, rating_avg, ratings_count, available
FROM public.driver_profiles;

GRANT SELECT ON public.driver_public_stats TO authenticated, anon;
