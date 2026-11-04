CREATE TYPE public.app_role AS ENUM ('customer','driver','worker','admin','super_admin','support','finance','moderator');
CREATE TYPE public.worker_level AS ENUM ('fani','khabir');
CREATE TYPE public.request_type AS ENUM ('taxi','service');
CREATE TYPE public.request_status AS ENUM ('pending','searching','accepted','in_progress','completed','cancelled');
CREATE TYPE public.vehicle_category AS ENUM ('economy','premium','luxury');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_unique ON public.profiles (lower(email)) WHERE email IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_staff_role(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id
    AND role IN ('super_admin','admin','support','finance','moderator'))
$$;
CREATE OR REPLACE FUNCTION public.has_admin_access(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role IN ('super_admin','admin'))
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'super_admin')
$$;
CREATE OR REPLACE FUNCTION public.get_staff_roles(p_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(role::text ORDER BY role::text), ARRAY[]::text[]) FROM public.user_roles
  WHERE user_id = p_user_id AND role IN ('super_admin','admin','support','finance','moderator')
    AND (p_user_id = auth.uid() OR public.has_staff_role(auth.uid()) OR auth.uid() IS NULL)
$$;
REVOKE ALL ON FUNCTION public.has_staff_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_admin_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_staff_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_staff_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_admin_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_roles(uuid) TO authenticated, service_role;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_staff_role(auth.uid()));
CREATE POLICY "Users self-assign customer role" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'customer'::public.app_role);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text;
BEGIN
  v_phone := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
  IF v_phone IS NULL OR EXISTS (SELECT 1 FROM public.profiles WHERE phone = v_phone) THEN
    v_phone := 'user-' || NEW.id::text;
  END IF;
  INSERT INTO public.profiles (id, phone, full_name, email)
  VALUES (NEW.id, v_phone, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          CASE WHEN NEW.email LIKE '%@mamnoon.app' THEN NULL ELSE lower(NEW.email) END)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  icon text NOT NULL DEFAULT 'wrench',
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.services TO authenticated, anon;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Services are public" ON public.services FOR SELECT TO authenticated, anon USING (true);
INSERT INTO public.services (slug, name_ar, name_en, icon, sort_order) VALUES
  ('build','بناء','Building','hammer',1),
  ('plaster','لبخ جدران وسقوف','Plastering','layers',2),
  ('carpentry_form','نجارة بيوت وقالب','Form Carpentry','square',3),
  ('flooring','تطبيق أرضيات','Flooring','grid',4),
  ('chef','طباخ (شيف)','Chef','chef-hat',5),
  ('plumbing','تأسيس ماء','Plumbing','droplet',6),
  ('electric_setup','تأسيس كهرباء','Electrical Setup','zap',7),
  ('electric_street','ربط كهرباء وتصليح أسلاك الشارع','Street Electric','cable',8),
  ('washer_repair','تصليح غسالة','Washer Repair','washing-machine',9),
  ('stove_repair','تصليح طباخ','Stove Repair','flame',10),
  ('fridge_repair','تصليح ثلاجة','Fridge Repair','refrigerator',11),
  ('ac_repair','تصليح وتنظيف سبلت','AC Service','wind',12),
  ('cleaning','تنظيف بيوت','House Cleaning','sparkles',13),
  ('wood_carpentry','نجارة أخشاب منزلية','Wood Carpentry','axe',14),
  ('blacksmith','حدادة','Blacksmith','anvil',15),
  ('general','خدمات منزلية عامة','General Home','home',16);

CREATE TABLE public.worker_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  level public.worker_level NOT NULL DEFAULT 'fani',
  available boolean NOT NULL DEFAULT false,
  bio text,
  status text NOT NULL DEFAULT 'approved',
  rating_avg numeric(3,2) NOT NULL DEFAULT 5.00,
  ratings_count int NOT NULL DEFAULT 0,
  completed_jobs int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO authenticated;
GRANT ALL ON public.worker_profiles TO service_role;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER worker_profiles_updated_at BEFORE UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.worker_services (
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, service_id)
);
GRANT SELECT, INSERT, DELETE ON public.worker_services TO authenticated;
GRANT ALL ON public.worker_services TO service_role;
ALTER TABLE public.worker_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worker services viewable" ON public.worker_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Worker inserts own services" ON public.worker_services FOR INSERT TO authenticated WITH CHECK (auth.uid() = worker_id);
CREATE POLICY "Worker deletes own services" ON public.worker_services FOR DELETE TO authenticated USING (auth.uid() = worker_id);

CREATE TABLE public.driver_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT false,
  vehicle_make text,
  vehicle_model text,
  vehicle_year int,
  vehicle_plate text,
  vehicle_color text,
  vehicle_category public.vehicle_category,
  status text NOT NULL DEFAULT 'approved',
  rating_avg numeric(3,2) NOT NULL DEFAULT 5.00,
  ratings_count int NOT NULL DEFAULT 0,
  completed_rides int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_profiles_available_cat ON public.driver_profiles (available, vehicle_category);
GRANT SELECT, INSERT, UPDATE ON public.driver_profiles TO authenticated;
GRANT ALL ON public.driver_profiles TO service_role;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_provider_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_admin_access(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN NEW.status := 'approved';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'status_readonly'; END IF;
    IF TG_OP = 'UPDATE' AND NEW.rating_avg IS DISTINCT FROM OLD.rating_avg THEN RAISE EXCEPTION 'rating_readonly'; END IF;
    IF NEW.status <> 'approved' AND NEW.available THEN NEW.available := false; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_provider_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_driver_status BEFORE INSERT OR UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_provider_status();
CREATE TRIGGER trg_guard_worker_status BEFORE INSERT OR UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_provider_status();

CREATE TABLE public.vehicle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make text NOT NULL,
  model text NOT NULL,
  category public.vehicle_category NOT NULL,
  base_fare numeric NOT NULL DEFAULT 2000,
  per_km numeric NOT NULL DEFAULT 500,
  min_year int NOT NULL DEFAULT 2000,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (make, model)
);
GRANT SELECT ON public.vehicle_models TO authenticated, anon;
GRANT ALL ON public.vehicle_models TO service_role;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_models readable" ON public.vehicle_models FOR SELECT USING (true);
INSERT INTO public.vehicle_models (make, model, category, base_fare, per_km) VALUES
  ('Kia','Pride','economy',1500,400),('Hyundai','Accent','economy',1500,400),('Toyota','Corolla','economy',2000,500),
  ('Nissan','Sunny','economy',1500,400),('Chevrolet','Aveo','economy',1500,400),('Hyundai','Elantra','premium',2500,650),
  ('Kia','Optima','premium',2500,650),('Toyota','Camry','premium',3000,750),('Honda','Accord','premium',3000,750),
  ('Hyundai','Sonata','premium',2800,700),('Mercedes','E-Class','luxury',5000,1200),('BMW','5 Series','luxury',5000,1200),
  ('Lexus','ES','luxury',4500,1100),('Audi','A6','luxury',5000,1200),('Genesis','G80','luxury',4500,1100);

CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type public.request_type NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  service_id uuid REFERENCES public.services(id),
  level_required public.worker_level,
  workers_count int NOT NULL DEFAULT 1,
  pickup_text text NOT NULL DEFAULT '',
  pickup_lat numeric,
  pickup_lng numeric,
  dest_text text,
  dest_lat numeric,
  dest_lng numeric,
  notes text,
  price_estimate numeric,
  vehicle_category public.vehicle_category,
  distance_km numeric,
  duration_min numeric,
  fare_breakdown jsonb,
  commission numeric,
  payment_method text DEFAULT 'cash',
  cancellation_reason text,
  cancelled_by uuid,
  searching_started_at timestamptz,
  admin_notes text,
  pricing_mode text,
  customer_price integer,
  work_hours numeric,
  work_description text,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_requests_status ON public.service_requests (status, created_at DESC);
CREATE INDEX idx_service_requests_customer ON public.service_requests (customer_id, created_at DESC);
CREATE INDEX idx_service_requests_provider ON public.service_requests (provider_id, created_at DESC);
CREATE INDEX idx_service_requests_status_type ON public.service_requests (status, type);
GRANT SELECT, INSERT, UPDATE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER service_requests_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.request_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired','cancelled')),
  distance_km numeric,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  responded_at timestamptz,
  UNIQUE (request_id, provider_id)
);
CREATE INDEX idx_offers_provider_status ON public.request_offers(provider_id, status);
CREATE INDEX idx_offers_request ON public.request_offers(request_id);
GRANT SELECT, UPDATE ON public.request_offers TO authenticated;
GRANT ALL ON public.request_offers TO service_role;
ALTER TABLE public.request_offers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_request_customer(_request_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.service_requests WHERE id = _request_id AND customer_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.has_offer(_request_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.request_offers WHERE request_id = _request_id AND provider_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.is_request_party(_request_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.service_requests WHERE id = _request_id AND _user_id IN (customer_id, provider_id))
$$;
REVOKE ALL ON FUNCTION public.is_request_customer(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_offer(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_request_party(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_request_customer(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_offer(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_request_party(uuid,uuid) TO authenticated, service_role;

CREATE POLICY "Provider sees own offers" ON public.request_offers FOR SELECT TO authenticated
  USING (provider_id = auth.uid() OR public.has_staff_role(auth.uid()));
CREATE POLICY "Customer sees offers for own request" ON public.request_offers FOR SELECT TO authenticated
  USING (public.is_request_customer(request_id, auth.uid()));
CREATE POLICY "Provider updates own offer" ON public.request_offers FOR UPDATE TO authenticated
  USING (provider_id = auth.uid()) WITH CHECK (provider_id = auth.uid());

CREATE POLICY "Parties see own requests" ON public.service_requests FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = provider_id);
CREATE POLICY "Staff see all requests" ON public.service_requests FOR SELECT TO authenticated
  USING (public.has_staff_role(auth.uid()));
CREATE POLICY "Driver sees offered taxi request" ON public.service_requests FOR SELECT TO authenticated
  USING (type = 'taxi' AND status IN ('pending','searching') AND public.has_offer(id, auth.uid()));
CREATE POLICY "Workers see available service requests" ON public.service_requests FOR SELECT TO authenticated
  USING (type = 'service' AND status IN ('pending','searching') AND public.has_role(auth.uid(), 'worker')
    AND (service_id IS NULL OR EXISTS (SELECT 1 FROM public.worker_services ws WHERE ws.worker_id = auth.uid() AND ws.service_id = service_requests.service_id)));
CREATE POLICY "Customer creates own requests" ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id AND provider_id IS NULL);
CREATE POLICY "Customer updates own request" ON public.service_requests FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Provider updates assigned request" ON public.service_requests FOR UPDATE TO authenticated
  USING (auth.uid() = provider_id) WITH CHECK (auth.uid() = provider_id);

CREATE OR REPLACE FUNCTION public.guard_customer_request_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM NEW.customer_id THEN RETURN NEW; END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN RAISE EXCEPTION 'customer_id_immutable'; END IF;
  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN RAISE EXCEPTION 'provider_id_readonly_for_customer'; END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN RAISE EXCEPTION 'type_immutable'; END IF;
  IF NEW.service_id IS DISTINCT FROM OLD.service_id THEN RAISE EXCEPTION 'service_id_immutable'; END IF;
  IF NEW.price_estimate IS DISTINCT FROM OLD.price_estimate THEN RAISE EXCEPTION 'price_readonly_for_customer'; END IF;
  IF NEW.commission IS DISTINCT FROM OLD.commission THEN RAISE EXCEPTION 'commission_readonly'; END IF;
  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN RAISE EXCEPTION 'accepted_at_readonly'; END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'completed_at_readonly'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending','searching','accepted','in_progress')) THEN
      RAISE EXCEPTION 'invalid_status_transition_for_customer';
    END IF;
    NEW.cancelled_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_customer_request_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_customer_request_update BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_request_update();

CREATE OR REPLACE FUNCTION public.enforce_single_active_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.service_requests WHERE customer_id = NEW.customer_id
      AND status IN ('pending','searching','accepted','in_progress') AND id <> NEW.id) THEN
    RAISE EXCEPTION 'active_request_exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = NEW.customer_id AND (b.expires_at IS NULL OR b.expires_at > now())) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_single_active_request() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chats_customer_id ON public.chats(customer_id);
CREATE INDEX idx_chats_provider_id ON public.chats(provider_id);
GRANT SELECT ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants see chat" ON public.chats FOR SELECT TO authenticated
  USING (auth.uid() IN (customer_id, provider_id) OR public.has_staff_role(auth.uid()));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_chat_id ON public.messages(chat_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND auth.uid() IN (c.customer_id, c.provider_id)) OR public.has_staff_role(auth.uid()));
CREATE POLICY "Chat participants send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND auth.uid() IN (c.customer_id, c.provider_id)));
CREATE POLICY "Receiver marks read" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id <> auth.uid() AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND auth.uid() IN (c.customer_id, c.provider_id)));

CREATE OR REPLACE FUNCTION public.touch_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.chats SET updated_at = now() WHERE id = NEW.chat_id; RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.touch_chat() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_touch_chat AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.touch_chat();

CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  professionalism int CHECK (professionalism BETWEEN 1 AND 5),
  punctuality int CHECK (punctuality BETWEEN 1 AND 5),
  quality int CHECK (quality BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ratings_request_rater_unique UNIQUE (request_id, rater_id)
);
CREATE INDEX idx_ratings_ratee ON public.ratings(ratee_id, created_at DESC);
GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ratings readable by signed-in users" ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Participant rates counterparty" ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rater_id AND EXISTS (
    SELECT 1 FROM public.service_requests r WHERE r.id = ratings.request_id
      AND ((r.customer_id = auth.uid() AND r.provider_id = ratings.ratee_id)
        OR (r.provider_id = auth.uid() AND r.customer_id = ratings.ratee_id))));

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Counterparties view profile via request" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_requests r
    WHERE (r.customer_id = profiles.id AND r.provider_id = auth.uid()) OR (r.provider_id = profiles.id AND r.customer_id = auth.uid())));
CREATE POLICY "Staff view profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_staff_role(auth.uid()));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Driver profile visible" ON public.driver_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_staff_role(auth.uid())
    OR EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.provider_id = driver_profiles.user_id AND sr.customer_id = auth.uid()));
CREATE POLICY "Driver creates own profile" ON public.driver_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Driver updates own profile" ON public.driver_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Worker profile visible" ON public.worker_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_staff_role(auth.uid())
    OR EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.provider_id = worker_profiles.user_id AND sr.customer_id = auth.uid()));
CREATE POLICY "Worker creates own profile" ON public.worker_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Worker updates own profile" ON public.worker_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE VIEW public.driver_public_stats WITH (security_invoker = true) AS
  SELECT user_id, vehicle_category, rating_avg, ratings_count, available FROM public.driver_profiles;
CREATE VIEW public.worker_public_stats WITH (security_invoker = true) AS
  SELECT user_id, level, rating_avg, ratings_count, available FROM public.worker_profiles;
GRANT SELECT ON public.driver_public_stats TO authenticated;
GRANT SELECT ON public.worker_public_stats TO authenticated;

CREATE TABLE public.live_locations (
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer','provider')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);
CREATE INDEX idx_live_locations_user ON public.live_locations(user_id);
CREATE INDEX idx_live_locations_updated_at ON public.live_locations(updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_locations TO authenticated;
GRANT ALL ON public.live_locations TO service_role;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties read live location" ON public.live_locations FOR SELECT TO authenticated
  USING (public.is_request_party(request_id, auth.uid()) OR public.has_staff_role(auth.uid()));
CREATE POLICY "Owner writes own live location" ON public.live_locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_request_party(request_id, auth.uid()));
CREATE POLICY "Owner updates own live location" ON public.live_locations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes own live location" ON public.live_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_live_location_speed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev RECORD; dist_km numeric; dt_sec numeric;
BEGIN
  SELECT lat, lng, updated_at INTO prev FROM public.live_locations WHERE user_id = NEW.user_id ORDER BY updated_at DESC LIMIT 1;
  IF prev.lat IS NOT NULL THEN
    dt_sec := GREATEST(1, EXTRACT(EPOCH FROM (now() - prev.updated_at)));
    dist_km := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(prev.lat)) * cos(radians(NEW.lat)) * cos(radians(NEW.lng) - radians(prev.lng)) + sin(radians(prev.lat)) * sin(radians(NEW.lat)))));
    IF (dist_km / dt_sec) * 3600 > 250 AND dist_km > 1 THEN RAISE EXCEPTION 'implausible_speed'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_live_location_speed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_live_location_speed BEFORE INSERT OR UPDATE ON public.live_locations FOR EACH ROW EXECUTE FUNCTION public.guard_live_location_speed();

CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_category text NOT NULL UNIQUE,
  base_fare numeric NOT NULL DEFAULT 1500,
  per_km numeric NOT NULL DEFAULT 400,
  per_min numeric NOT NULL DEFAULT 50,
  minimum_fare numeric NOT NULL DEFAULT 2000,
  commission_pct numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_rules TO anon, authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing readable by all" ON public.pricing_rules FOR SELECT USING (true);
INSERT INTO public.pricing_rules (vehicle_category, base_fare, per_km, per_min, minimum_fare, commission_pct) VALUES
  ('economy',1500,400,40,2000,0),('premium',2500,650,60,3000,0),('luxury',4500,1100,100,5000,0);

CREATE TABLE public.driver_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  USING (user_id = auth.uid() OR public.has_staff_role(auth.uid()));

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('earning','commission','withdrawal','refund','adjustment')),
  amount numeric NOT NULL,
  balance_after numeric,
  currency text NOT NULL DEFAULT 'IQD',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_user_created ON public.transactions(user_id, created_at DESC);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User sees own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_staff_role(auth.uid()));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_created ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User sees own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "User marks own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  expires_at timestamptz,
  blocked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  resolution_note text,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporter sees own reports" ON public.user_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY "Users file reports" ON public.user_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND status = 'pending' AND resolved_by IS NULL);

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'percentage' CHECK (type IN ('percentage','fixed')),
  value numeric NOT NULL DEFAULT 0,
  max_uses int NOT NULL DEFAULT 1000,
  used_count int NOT NULL DEFAULT 0,
  min_amount numeric NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
GRANT SELECT, INSERT, DELETE ON public.friends TO authenticated;
GRANT ALL ON public.friends TO service_role;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own friends" ON public.friends FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users add own friends" ON public.friends FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users remove own friends" ON public.friends FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.resolve_friend_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.friend_id IS NULL AND NEW.friend_phone IS NOT NULL THEN
    SELECT id INTO NEW.friend_id FROM public.profiles WHERE phone = NEW.friend_phone LIMIT 1;
    IF NEW.friend_id IS NULL THEN RAISE EXCEPTION 'friend_not_found'; END IF;
  END IF;
  IF NEW.friend_id = NEW.user_id THEN RAISE EXCEPTION 'cannot_add_self'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.resolve_friend_phone() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_resolve_friend_phone BEFORE INSERT ON public.friends FOR EACH ROW EXECUTE FUNCTION public.resolve_friend_phone();

CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties see friend requests" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() IN (sender_id, receiver_id));
CREATE POLICY "Sender creates friend request" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND status = 'pending');
CREATE POLICY "Receiver responds" ON public.friend_requests FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Parties delete friend request" ON public.friend_requests FOR DELETE TO authenticated USING (auth.uid() IN (sender_id, receiver_id));

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Owner or staff see tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_staff_role(auth.uid()));
CREATE POLICY "Users open own tickets" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open');

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_msgs_ticket ON public.support_ticket_messages(ticket_id, created_at);
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket parties read messages" ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()) OR public.has_staff_role(auth.uid()));
CREATE POLICY "Ticket parties send messages" ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND (
    (is_staff = false AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()))
    OR (is_staff = true AND public.has_staff_role(auth.uid()))));

CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  tier int NOT NULL DEFAULT 0,
  max_requests_per_month int,
  priority_weight int NOT NULL DEFAULT 0,
  offer_priority int NOT NULL DEFAULT 0,
  badge_label text,
  badge_color text,
  show_stats boolean NOT NULL DEFAULT false,
  priority_support boolean NOT NULL DEFAULT false,
  monthly_price int NOT NULL DEFAULT 0,
  yearly_price int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IQD',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active plans readable" ON public.subscription_plans FOR SELECT TO authenticated USING (is_active);
INSERT INTO public.subscription_plans (code, name_ar, name_en, tier, max_requests_per_month, priority_weight, offer_priority, badge_label, badge_color, show_stats, priority_support, monthly_price, yearly_price, sort_order) VALUES
  ('free','مجاني','Free',0,NULL,0,0,NULL,NULL,false,false,0,0,1),
  ('silver','فضي','Silver',1,NULL,10,10,'فضي','#C0C0C0',true,false,0,0,2),
  ('gold','ذهبي','Gold',2,NULL,20,20,'ذهبي','#FFD700',true,true,0,0,3);

CREATE TABLE public.subscription_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  subscription_enabled boolean NOT NULL DEFAULT false,
  minimum_downloads_before_activation int NOT NULL DEFAULT 100000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.subscription_settings TO service_role;
ALTER TABLE public.subscription_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.subscription_settings (id) VALUES (1);

CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'active',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  request_count int NOT NULL DEFAULT 0,
  resets_count_period_start timestamptz NOT NULL DEFAULT now(),
  auto_renew boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Users see own subscription" ON public.user_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id),
  amount int NOT NULL,
  currency text NOT NULL DEFAULT 'IQD',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'paid',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own payments" ON public.subscription_payments FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_single_active_request BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_request();

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.request_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.service_requests REPLICA IDENTITY FULL;