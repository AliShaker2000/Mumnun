
CREATE OR REPLACE FUNCTION public.find_nearby_provider_pins(
  _lat numeric,
  _lng numeric,
  _type text,
  _category text DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _radius_km numeric DEFAULT 5,
  _limit int DEFAULT 30
)
RETURNS TABLE(pin_id text, lat numeric, lng numeric, heading numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    md5(ll.user_id::text) AS pin_id,
    ll.lat,
    ll.lng,
    ll.heading
  FROM public.live_locations ll
  WHERE ll.updated_at > now() - interval '5 minutes'
    AND ll.role = 'provider'
    AND (
      (_type = 'taxi' AND EXISTS (
        SELECT 1 FROM public.driver_profiles dp
        WHERE dp.user_id = ll.user_id
          AND dp.available = true
          AND (_category IS NULL OR dp.vehicle_category::text = _category)
      ))
      OR
      (_type = 'service' AND EXISTS (
        SELECT 1 FROM public.worker_profiles wp
        WHERE wp.user_id = ll.user_id
          AND wp.available = true
          AND (
            _service_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.worker_services ws
              WHERE ws.worker_id = wp.user_id
                AND ws.service_id = _service_id
            )
          )
      ))
    )
    AND (
      6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(_lat)) * cos(radians(ll.lat)) *
        cos(radians(ll.lng) - radians(_lng)) +
        sin(radians(_lat)) * sin(radians(ll.lat))
      )))
    ) <= _radius_km
  ORDER BY ll.updated_at DESC
  LIMIT _limit
$$;

GRANT EXECUTE ON FUNCTION public.find_nearby_provider_pins(numeric, numeric, text, text, uuid, numeric, int) TO authenticated, anon;
