CREATE TABLE public.provider_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_presence TO authenticated;
GRANT ALL ON public.provider_presence TO service_role;
ALTER TABLE public.provider_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own presence read" ON public.provider_presence FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own presence insert" ON public.provider_presence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own presence update" ON public.provider_presence FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own presence delete" ON public.provider_presence FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_provider_presence() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER provider_presence_touch BEFORE INSERT OR UPDATE ON public.provider_presence FOR EACH ROW EXECUTE FUNCTION public.touch_provider_presence();

CREATE OR REPLACE FUNCTION public.find_nearby_drivers(_lat numeric, _lng numeric, _category text, _radius_km numeric DEFAULT 5, _limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, distance_km numeric, rating_avg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.user_id, x.distance_km, x.rating_avg FROM (
    SELECT DISTINCT ON (dp.user_id) dp.user_id, dp.rating_avg,
      (6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(_lat)) * cos(radians(loc.lat)) * cos(radians(loc.lng) - radians(_lng)) + sin(radians(_lat)) * sin(radians(loc.lat))))))::numeric AS distance_km
    FROM public.driver_profiles dp
    JOIN (
      SELECT pp.user_id, pp.lat, pp.lng, pp.updated_at FROM public.provider_presence pp
      UNION ALL
      SELECT ll.user_id, ll.lat, ll.lng, ll.updated_at FROM public.live_locations ll
    ) loc ON loc.user_id = dp.user_id
    WHERE dp.available AND dp.status = 'approved'
      AND (_category IS NULL OR dp.vehicle_category::text = _category)
      AND loc.updated_at > now() - interval '5 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.provider_id = dp.user_id AND sr.status IN ('accepted','in_progress'))
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = dp.user_id AND (b.expires_at IS NULL OR b.expires_at > now()))
    ORDER BY dp.user_id, loc.updated_at DESC
  ) x
  WHERE x.distance_km <= _radius_km
  ORDER BY x.distance_km ASC, x.rating_avg DESC NULLS LAST
  LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.find_nearby_drivers(numeric,numeric,text,numeric,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_drivers(numeric,numeric,text,numeric,int) TO service_role;

CREATE OR REPLACE FUNCTION public.find_nearby_provider_pins(_lat numeric, _lng numeric, _type text, _category text DEFAULT NULL, _service_id uuid DEFAULT NULL, _radius_km numeric DEFAULT 5, _limit int DEFAULT 30)
RETURNS TABLE(pin_id text, lat numeric, lng numeric, heading numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(pp.user_id::text), pp.lat::numeric, pp.lng::numeric, pp.heading::numeric
  FROM public.provider_presence pp
  WHERE pp.updated_at > now() - interval '5 minutes'
    AND ((_type = 'taxi' AND EXISTS (SELECT 1 FROM public.driver_profiles dp WHERE dp.user_id = pp.user_id AND dp.available AND dp.status = 'approved' AND (_category IS NULL OR dp.vehicle_category::text = _category)))
      OR (_type = 'service' AND EXISTS (SELECT 1 FROM public.worker_profiles wp WHERE wp.user_id = pp.user_id AND wp.available
            AND (_service_id IS NULL OR EXISTS (SELECT 1 FROM public.worker_services ws WHERE ws.worker_id = wp.user_id AND ws.service_id = _service_id)))))
    AND 6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(_lat)) * cos(radians(pp.lat)) * cos(radians(pp.lng) - radians(_lng)) + sin(radians(_lat)) * sin(radians(pp.lat))))) <= _radius_km
  ORDER BY pp.updated_at DESC
  LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.find_nearby_provider_pins(numeric,numeric,text,text,uuid,numeric,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_provider_pins(numeric,numeric,text,text,uuid,numeric,int) TO authenticated, service_role;