
-- 1) Rate-limit: one active request per customer
CREATE OR REPLACE FUNCTION public.enforce_single_active_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE customer_id = NEW.customer_id
      AND status IN ('pending','searching','accepted','in_progress')
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'active_request_exists';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_single_active_request ON public.service_requests;
CREATE TRIGGER trg_single_active_request
BEFORE INSERT ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_request();

-- 2) GPS spoof guard on live_locations
CREATE OR REPLACE FUNCTION public.guard_live_location_speed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev RECORD;
  dist_km numeric;
  dt_sec numeric;
  speed_kmh numeric;
BEGIN
  SELECT lat, lng, updated_at INTO prev FROM public.live_locations WHERE user_id = NEW.user_id;
  IF prev.lat IS NOT NULL THEN
    dt_sec := GREATEST(1, EXTRACT(EPOCH FROM (now() - prev.updated_at)));
    dist_km := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(prev.lat)) * cos(radians(NEW.lat)) *
      cos(radians(NEW.lng) - radians(prev.lng)) +
      sin(radians(prev.lat)) * sin(radians(NEW.lat))
    )));
    speed_kmh := (dist_km / dt_sec) * 3600;
    IF speed_kmh > 250 THEN
      RAISE EXCEPTION 'implausible_speed';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_live_location_speed ON public.live_locations;
CREATE TRIGGER trg_guard_live_location_speed
BEFORE INSERT OR UPDATE ON public.live_locations
FOR EACH ROW EXECUTE FUNCTION public.guard_live_location_speed();

-- 3) Performance indexes
CREATE INDEX IF NOT EXISTS idx_live_locations_updated_at ON public.live_locations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_available_cat ON public.driver_profiles (available, vehicle_category);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_customer ON public.service_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_provider ON public.service_requests (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_offers_provider_status ON public.request_offers (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_request_offers_request ON public.request_offers (request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read_at, created_at DESC);
