
-- Extend service_requests
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS distance_km numeric,
  ADD COLUMN IF NOT EXISTS duration_min numeric,
  ADD COLUMN IF NOT EXISTS fare_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS commission numeric,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS searching_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- request_offers
CREATE TABLE IF NOT EXISTS public.request_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired','cancelled')),
  distance_km numeric,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 seconds'),
  responded_at timestamptz,
  UNIQUE (request_id, provider_id)
);
GRANT SELECT, INSERT, UPDATE ON public.request_offers TO authenticated;
GRANT ALL ON public.request_offers TO service_role;
ALTER TABLE public.request_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider sees own offers" ON public.request_offers
  FOR SELECT TO authenticated USING (provider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customer sees offers for own request" ON public.request_offers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = request_id AND sr.customer_id = auth.uid())
  );
CREATE POLICY "Provider updates own offer" ON public.request_offers
  FOR UPDATE TO authenticated USING (provider_id = auth.uid()) WITH CHECK (provider_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_offers_provider_pending ON public.request_offers(provider_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offers_request ON public.request_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_offers_expires ON public.request_offers(expires_at) WHERE status = 'pending';
ALTER PUBLICATION supabase_realtime ADD TABLE public.request_offers;

-- pricing_rules
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_category text NOT NULL UNIQUE,
  base_fare numeric NOT NULL DEFAULT 1500,
  per_km numeric NOT NULL DEFAULT 400,
  per_min numeric NOT NULL DEFAULT 50,
  minimum_fare numeric NOT NULL DEFAULT 2000,
  commission_pct numeric NOT NULL DEFAULT 15,
  currency text NOT NULL DEFAULT 'IQD',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_rules TO anon, authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing readable by all" ON public.pricing_rules FOR SELECT USING (true);
CREATE POLICY "Admins manage pricing" ON public.pricing_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

INSERT INTO public.pricing_rules (vehicle_category, base_fare, per_km, per_min, minimum_fare, commission_pct) VALUES
  ('economy', 1500, 400, 40, 2000, 15),
  ('premium', 2500, 650, 60, 3000, 15),
  ('luxury',  4500, 1100, 100, 5000, 18)
ON CONFLICT (vehicle_category) DO NOTHING;

-- driver_wallets
CREATE TABLE IF NOT EXISTS public.driver_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  total_commission numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.driver_wallets TO authenticated;
GRANT ALL ON public.driver_wallets TO service_role;
ALTER TABLE public.driver_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Driver sees own wallet" ON public.driver_wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));

-- transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('earning','commission','withdrawal','refund','adjustment')),
  amount numeric NOT NULL,
  balance_after numeric,
  currency text NOT NULL DEFAULT 'IQD',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User sees own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_tx_user_created ON public.transactions(user_id, created_at DESC);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User sees own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "User marks own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON public.notifications(user_id, created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Geo indexes
CREATE INDEX IF NOT EXISTS idx_live_locations_user ON public.live_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_live_locations_lat_lng ON public.live_locations(lat, lng);

-- Nearby drivers helper
CREATE OR REPLACE FUNCTION public.find_nearby_drivers(
  _lat numeric, _lng numeric, _category text, _radius_km numeric DEFAULT 5, _limit int DEFAULT 10
) RETURNS TABLE(user_id uuid, distance_km numeric, rating_avg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    dp.user_id,
    ( 6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(_lat)) * cos(radians(ll.lat)) * cos(radians(ll.lng) - radians(_lng))
          + sin(radians(_lat)) * sin(radians(ll.lat))
        ))
      )
    )::numeric AS distance_km,
    dp.rating_avg
  FROM public.driver_profiles dp
  JOIN public.live_locations ll ON ll.user_id = dp.user_id
  WHERE dp.available = true
    AND dp.vehicle_category::text = _category
    AND ll.updated_at > now() - interval '5 minutes'
    AND ( 6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(_lat)) * cos(radians(ll.lat)) * cos(radians(ll.lng) - radians(_lng))
          + sin(radians(_lat)) * sin(radians(ll.lat))
        ))
      )
    ) <= _radius_km
    AND NOT EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.provider_id = dp.user_id AND sr.status IN ('accepted','in_progress')
    )
  ORDER BY distance_km ASC, dp.rating_avg DESC NULLS LAST
  LIMIT _limit
$$;
REVOKE EXECUTE ON FUNCTION public.find_nearby_drivers(numeric,numeric,text,numeric,int) FROM PUBLIC, anon, authenticated;

-- On completed: wallet + transactions + notifications
CREATE OR REPLACE FUNCTION public.on_request_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commission numeric;
  v_earning numeric;
  v_pct numeric;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.provider_id IS NOT NULL AND NEW.price_estimate IS NOT NULL THEN
    SELECT commission_pct INTO v_pct FROM public.pricing_rules WHERE vehicle_category = NEW.vehicle_category::text LIMIT 1;
    v_pct := COALESCE(v_pct, 15);
    v_commission := ROUND(NEW.price_estimate * v_pct / 100);
    v_earning := NEW.price_estimate - v_commission;

    INSERT INTO public.driver_wallets (user_id, balance, total_earned, total_commission)
    VALUES (NEW.provider_id, v_earning, v_earning, v_commission)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = driver_wallets.balance + v_earning,
      total_earned = driver_wallets.total_earned + v_earning,
      total_commission = driver_wallets.total_commission + v_commission,
      updated_at = now();

    INSERT INTO public.transactions (user_id, request_id, type, amount, note)
    VALUES (NEW.provider_id, NEW.id, 'earning', v_earning, 'كسب من الرحلة'),
           (NEW.provider_id, NEW.id, 'commission', -v_commission, 'عمولة المنصة');

    UPDATE public.service_requests SET commission = v_commission WHERE id = NEW.id;

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES
      (NEW.customer_id, 'request_completed', 'اكتملت الرحلة', 'يرجى تقييم الكابتن', '/request/' || NEW.id),
      (NEW.provider_id, 'earning', 'أرباح جديدة', 'تمت إضافة ' || v_earning::text || ' إلى محفظتك', '/profile');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_request_completed ON public.service_requests;
CREATE TRIGGER trg_request_completed AFTER UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_request_completed();

-- On rating insert: update provider rating_avg
CREATE OR REPLACE FUNCTION public.on_rating_inserted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.driver_profiles SET
    rating_avg = (SELECT AVG(stars)::numeric(3,2) FROM public.ratings WHERE ratee_id = NEW.ratee_id),
    ratings_count = (SELECT COUNT(*) FROM public.ratings WHERE ratee_id = NEW.ratee_id)
  WHERE user_id = NEW.ratee_id;

  UPDATE public.worker_profiles SET
    rating_avg = (SELECT AVG(stars)::numeric(3,2) FROM public.ratings WHERE ratee_id = NEW.ratee_id),
    ratings_count = (SELECT COUNT(*) FROM public.ratings WHERE ratee_id = NEW.ratee_id)
  WHERE user_id = NEW.ratee_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rating_inserted ON public.ratings;
CREATE TRIGGER trg_rating_inserted AFTER INSERT ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.on_rating_inserted();

-- Cron: expire stale offers
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('expire-request-offers');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'expire-request-offers', '* * * * *',
  $cron$ UPDATE public.request_offers SET status='expired' WHERE status='pending' AND expires_at < now(); $cron$
);

-- Admin RLS on service_requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='service_requests' AND policyname='Admins see all requests') THEN
    CREATE POLICY "Admins see all requests" ON public.service_requests FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(),'admin'::public.app_role));
  END IF;
END $$;
