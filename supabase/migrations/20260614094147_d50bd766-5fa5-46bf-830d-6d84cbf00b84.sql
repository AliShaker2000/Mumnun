
-- 1. profiles: drop broad SELECT, add scoped one
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Counterparties view profile via request"
ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.service_requests r
  WHERE (r.customer_id = profiles.id AND r.provider_id = auth.uid())
     OR (r.provider_id = profiles.id AND r.customer_id = auth.uid())
));

CREATE POLICY "Counterparties view profile via chat"
ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.chats c
  WHERE (c.customer_id = profiles.id AND c.provider_id = auth.uid())
     OR (c.provider_id = profiles.id AND c.customer_id = auth.uid())
));

-- 2. ratings: participant + counterparty + one-per-request
DROP POLICY IF EXISTS "Users create own ratings" ON public.ratings;

CREATE POLICY "Participant rates counterparty"
ON public.ratings FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = rater_id
  AND EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = ratings.request_id
      AND (
        (r.customer_id = auth.uid() AND r.provider_id = ratings.ratee_id)
        OR
        (r.provider_id = auth.uid() AND r.customer_id = ratings.ratee_id)
      )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ratings_request_rater_uniq
  ON public.ratings(request_id, rater_id);

-- 3. service_requests: provider claim requires role
DROP POLICY IF EXISTS "Provider updates assigned or accepts pending" ON public.service_requests;

CREATE POLICY "Provider updates assigned or accepts pending"
ON public.service_requests FOR UPDATE TO authenticated
USING (
  auth.uid() = provider_id
  OR (
    status = 'pending'::request_status
    AND provider_id IS NULL
    AND (
      (type = 'taxi'::request_type AND public.has_role(auth.uid(), 'driver'::app_role))
      OR
      (type = 'service'::request_type AND public.has_role(auth.uid(), 'worker'::app_role))
    )
  )
)
WITH CHECK (
  auth.uid() = provider_id
  OR (
    status = 'pending'::request_status
    AND (
      (type = 'taxi'::request_type AND public.has_role(auth.uid(), 'driver'::app_role))
      OR
      (type = 'service'::request_type AND public.has_role(auth.uid(), 'worker'::app_role))
    )
  )
);

-- 4. user_roles: only self-assign 'customer'; driver/worker via secured function
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

CREATE POLICY "Users self-assign customer role"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'customer'::app_role);

CREATE OR REPLACE FUNCTION public.grant_provider_role(_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _role NOT IN ('driver'::app_role, 'worker'::app_role) THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF _role = 'driver'::app_role AND NOT EXISTS (SELECT 1 FROM public.driver_profiles WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Driver profile required';
  END IF;
  IF _role = 'worker'::app_role AND NOT EXISTS (SELECT 1 FROM public.worker_profiles WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Worker profile required';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, _role)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_provider_role(app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_provider_role(app_role) TO authenticated;

-- 5. has_role: lock down execute privileges (used only inside RLS)
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;

-- 6. realtime.messages: restrict subscriptions to request participants
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants subscribe to request channels" ON realtime.messages;

CREATE POLICY "Participants subscribe to request channels"
ON realtime.messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE realtime.topic() LIKE 'live-' || r.id::text || '-%'
      AND (auth.uid() = r.customer_id OR auth.uid() = r.provider_id)
  )
);
