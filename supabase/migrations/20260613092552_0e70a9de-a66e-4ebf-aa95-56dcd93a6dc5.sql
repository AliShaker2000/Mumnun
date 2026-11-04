
-- 1) Vehicle category enum
DO $$ BEGIN
  CREATE TYPE public.vehicle_category AS ENUM ('economy','premium','luxury');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend driver_profiles
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS vehicle_make text,
  ADD COLUMN IF NOT EXISTS vehicle_year int,
  ADD COLUMN IF NOT EXISTS vehicle_category public.vehicle_category;

-- 3) Vehicle models catalog
CREATE TABLE IF NOT EXISTS public.vehicle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make text NOT NULL,
  model text NOT NULL,
  category public.vehicle_category NOT NULL,
  base_fare numeric NOT NULL DEFAULT 2000,
  per_km numeric NOT NULL DEFAULT 500,
  min_year int NOT NULL DEFAULT 2000,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(make, model)
);

GRANT SELECT ON public.vehicle_models TO authenticated, anon;
GRANT ALL ON public.vehicle_models TO service_role;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_models readable" ON public.vehicle_models;
CREATE POLICY "vehicle_models readable" ON public.vehicle_models FOR SELECT USING (true);

-- Seed common models for Iraqi market
INSERT INTO public.vehicle_models (make, model, category, base_fare, per_km) VALUES
  ('Kia','Pride','economy',1500,400),
  ('Hyundai','Accent','economy',1500,400),
  ('Toyota','Corolla','economy',2000,500),
  ('Nissan','Sunny','economy',1500,400),
  ('Chevrolet','Aveo','economy',1500,400),
  ('Hyundai','Elantra','premium',2500,650),
  ('Kia','Optima','premium',2500,650),
  ('Toyota','Camry','premium',3000,750),
  ('Honda','Accord','premium',3000,750),
  ('Hyundai','Sonata','premium',2800,700),
  ('Mercedes','E-Class','luxury',5000,1200),
  ('BMW','5 Series','luxury',5000,1200),
  ('Lexus','ES','luxury',4500,1100),
  ('Audi','A6','luxury',5000,1200),
  ('Genesis','G80','luxury',4500,1100)
ON CONFLICT (make, model) DO NOTHING;

-- 4) Taxi requests: requested category
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS vehicle_category public.vehicle_category;

-- 5) Live locations table
CREATE TABLE IF NOT EXISTS public.live_locations (
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer','provider')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_locations TO authenticated;
GRANT ALL ON public.live_locations TO service_role;

ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties read live location" ON public.live_locations;
CREATE POLICY "Parties read live location" ON public.live_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests r
      WHERE r.id = live_locations.request_id
        AND (auth.uid() = r.customer_id OR auth.uid() = r.provider_id)
    )
  );

DROP POLICY IF EXISTS "Owner writes own live location" ON public.live_locations;
CREATE POLICY "Owner writes own live location" ON public.live_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.service_requests r
      WHERE r.id = live_locations.request_id
        AND (auth.uid() = r.customer_id OR auth.uid() = r.provider_id)
    )
  );

DROP POLICY IF EXISTS "Owner updates own live location" ON public.live_locations;
CREATE POLICY "Owner updates own live location" ON public.live_locations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner deletes own live location" ON public.live_locations;
CREATE POLICY "Owner deletes own live location" ON public.live_locations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
