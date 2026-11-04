
-- 1) Unique constraint on ratings
ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_request_rater_unique;
ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_request_rater_unique UNIQUE (request_id, rater_id);

-- 2) Lock down customer UPDATE on service_requests
DROP POLICY IF EXISTS "Customer updates own request" ON public.service_requests;

CREATE OR REPLACE FUNCTION public.guard_customer_request_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only run for customer-initiated updates (skip service_role / admin / provider updates)
  IF auth.uid() IS DISTINCT FROM NEW.customer_id THEN
    RETURN NEW;
  END IF;

  -- Immutable identity/routing fields
  IF NEW.customer_id  IS DISTINCT FROM OLD.customer_id  THEN RAISE EXCEPTION 'customer_id_immutable'; END IF;
  IF NEW.provider_id  IS DISTINCT FROM OLD.provider_id  THEN RAISE EXCEPTION 'provider_id_readonly_for_customer'; END IF;
  IF NEW.type         IS DISTINCT FROM OLD.type         THEN RAISE EXCEPTION 'type_immutable'; END IF;
  IF NEW.service_id   IS DISTINCT FROM OLD.service_id   THEN RAISE EXCEPTION 'service_id_immutable'; END IF;
  IF NEW.price_estimate IS DISTINCT FROM OLD.price_estimate THEN RAISE EXCEPTION 'price_readonly_for_customer'; END IF;
  IF NEW.commission   IS DISTINCT FROM OLD.commission   THEN RAISE EXCEPTION 'commission_readonly'; END IF;
  IF NEW.accepted_at  IS DISTINCT FROM OLD.accepted_at  THEN RAISE EXCEPTION 'accepted_at_readonly'; END IF;
  IF NEW.started_at   IS DISTINCT FROM OLD.started_at   THEN RAISE EXCEPTION 'started_at_readonly'; END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'completed_at_readonly'; END IF;

  -- Status transitions allowed for customer:
  --   pending    -> cancelled
  --   searching  -> cancelled
  --   accepted   -> cancelled
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending','searching','accepted')) THEN
      RAISE EXCEPTION 'invalid_status_transition_for_customer';
    END IF;
    NEW.cancelled_by := auth.uid();
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.guard_customer_request_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_customer_request_update ON public.service_requests;
CREATE TRIGGER trg_guard_customer_request_update
BEFORE UPDATE ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_request_update();

CREATE POLICY "Customer updates own request"
ON public.service_requests FOR UPDATE TO authenticated
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);
