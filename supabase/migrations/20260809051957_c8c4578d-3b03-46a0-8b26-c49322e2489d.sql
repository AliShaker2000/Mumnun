CREATE OR REPLACE FUNCTION public.grant_provider_role_safe(_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _role NOT IN ('driver'::public.app_role, 'worker'::public.app_role) THEN
    RAISE EXCEPTION 'invalid_provider_role';
  END IF;
  IF _role = 'driver'::public.app_role AND NOT EXISTS (
    SELECT 1 FROM public.driver_profiles WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'driver_profile_required';
  END IF;
  IF _role = 'worker'::public.app_role AND NOT EXISTS (
    SELECT 1 FROM public.worker_profiles WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'worker_profile_required';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_request(_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.service_requests%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_request FROM public.service_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR v_request.customer_id <> auth.uid() THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_request.type <> 'taxi'::public.request_type THEN RETURN 0; END IF;
  IF v_request.pickup_lat IS NULL OR v_request.pickup_lng IS NULL THEN RAISE EXCEPTION 'pickup_location_required'; END IF;
  IF v_request.status NOT IN ('pending'::public.request_status, 'searching'::public.request_status) THEN RAISE EXCEPTION 'invalid_request_status'; END IF;

  UPDATE public.service_requests
  SET status = 'searching', searching_started_at = now()
  WHERE id = _request_id;

  DELETE FROM public.request_offers WHERE request_id = _request_id AND status = 'pending';
  INSERT INTO public.request_offers (request_id, provider_id, distance_km, status, expires_at)
  SELECT _request_id, d.user_id, d.distance_km, 'pending', now() + interval '45 seconds'
  FROM public.find_nearby_drivers(
    v_request.pickup_lat,
    v_request.pickup_lng,
    COALESCE(v_request.vehicle_category::text, 'economy'),
    10,
    10
  ) d
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

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
  WHERE id = _request_id AND status = 'searching'
    AND (
      EXISTS (SELECT 1 FROM public.request_offers o WHERE o.request_id = _request_id AND o.provider_id = auth.uid() AND o.status = 'pending' AND o.expires_at > now())
      OR type = 'service'::public.request_type
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

CREATE OR REPLACE FUNCTION public.transition_service_request(_request_id uuid, _status public.request_status, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.service_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_request FROM public.service_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF _status = 'cancelled'::public.request_status THEN
    IF auth.uid() NOT IN (v_request.customer_id, v_request.provider_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF v_request.status IN ('completed'::public.request_status, 'cancelled'::public.request_status) THEN RAISE EXCEPTION 'request_finished'; END IF;
    UPDATE public.service_requests SET status = 'cancelled', cancellation_reason = NULLIF(trim(_reason), ''), cancelled_by = auth.uid() WHERE id = _request_id;
    DELETE FROM public.request_offers WHERE request_id = _request_id;
    RETURN true;
  END IF;

  IF v_request.provider_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status = 'in_progress'::public.request_status AND v_request.status = 'accepted'::public.request_status THEN
    UPDATE public.service_requests SET status = 'in_progress' WHERE id = _request_id;
    RETURN true;
  END IF;
  IF _status = 'completed'::public.request_status AND v_request.status = 'in_progress'::public.request_status THEN
    UPDATE public.service_requests SET status = 'completed', completed_at = now() WHERE id = _request_id;
    RETURN true;
  END IF;
  RAISE EXCEPTION 'invalid_status_transition';
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_provider_role_safe(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_service_request(uuid, public.request_status, text) TO authenticated;
REVOKE ALL ON FUNCTION public.grant_provider_role_safe(public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_service_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transition_service_request(uuid, public.request_status, text) FROM anon;