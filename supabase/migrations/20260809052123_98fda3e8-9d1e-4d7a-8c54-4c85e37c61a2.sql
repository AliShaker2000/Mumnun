DROP POLICY IF EXISTS "Driver inserts own profile" ON public.driver_profiles;
CREATE POLICY "Driver creates own onboarding profile"
ON public.driver_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Worker inserts own profile" ON public.worker_profiles;
CREATE POLICY "Worker creates own onboarding profile"
ON public.worker_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Driver sees offered taxi request"
ON public.service_requests FOR SELECT TO authenticated
USING (
  type = 'taxi'::public.request_type
  AND status = 'searching'::public.request_status
  AND EXISTS (
    SELECT 1 FROM public.request_offers o
    WHERE o.request_id = service_requests.id
      AND o.provider_id = auth.uid()
      AND o.status = 'pending'
      AND o.expires_at > now()
  )
);

DROP POLICY IF EXISTS "Workers see pending service requests" ON public.service_requests;
CREATE POLICY "Workers see available service requests"
ON public.service_requests FOR SELECT TO authenticated
USING (
  type = 'service'::public.request_type
  AND status IN ('pending'::public.request_status, 'searching'::public.request_status)
  AND public.has_role(auth.uid(), 'worker'::public.app_role)
  AND (
    service_id IS NULL OR EXISTS (
      SELECT 1 FROM public.worker_services ws
      WHERE ws.worker_id = auth.uid() AND ws.service_id = service_requests.service_id
    )
  )
);

CREATE OR REPLACE FUNCTION public.accept_service_request(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(auth.uid(), 'driver') OR public.has_role(auth.uid(), 'worker')) THEN
    RAISE EXCEPTION 'provider_role_required';
  END IF;
  UPDATE public.service_requests
  SET provider_id = auth.uid(), status = 'accepted', accepted_at = now()
  WHERE id = _request_id
    AND (
      (
        type = 'taxi'::public.request_type
        AND status = 'searching'::public.request_status
        AND public.has_role(auth.uid(), 'driver')
        AND EXISTS (
          SELECT 1 FROM public.request_offers o
          WHERE o.request_id = _request_id AND o.provider_id = auth.uid()
            AND o.status = 'pending' AND o.expires_at > now()
        )
      )
      OR
      (
        type = 'service'::public.request_type
        AND status IN ('pending'::public.request_status, 'searching'::public.request_status)
        AND public.has_role(auth.uid(), 'worker')
        AND (service_id IS NULL OR EXISTS (
          SELECT 1 FROM public.worker_services ws
          WHERE ws.worker_id = auth.uid() AND ws.service_id = service_requests.service_id
        ))
      )
    )
  RETURNING customer_id INTO v_customer;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'request_unavailable'; END IF;

  INSERT INTO public.chats (request_id, customer_id, provider_id)
  VALUES (_request_id, v_customer, auth.uid())
  ON CONFLICT DO NOTHING;
  DELETE FROM public.request_offers WHERE request_id = _request_id AND provider_id <> auth.uid();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid) TO authenticated;