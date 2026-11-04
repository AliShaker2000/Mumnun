
DROP POLICY IF EXISTS "Ratings viewable by all" ON public.ratings;

CREATE POLICY "Ratings viewable by participants and ratee"
ON public.ratings FOR SELECT TO authenticated
USING (
  auth.uid() = rater_id
  OR auth.uid() = ratee_id
  OR EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = ratings.request_id
      AND (sr.customer_id = auth.uid() OR sr.provider_id = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin')
);
