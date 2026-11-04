
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('customer', 'driver', 'worker');
CREATE TYPE public.worker_level AS ENUM ('fani', 'khabir');
CREATE TYPE public.request_type AS ENUM ('taxi', 'service');
CREATE TYPE public.request_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own roles"
  ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ SERVICES (catalog) ============
CREATE TABLE public.services (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'wrench',
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.services TO authenticated, anon;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Services are public" ON public.services FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.services (slug, name_ar, name_en, icon, sort_order) VALUES
  ('build', 'بناء', 'Building', 'hammer', 1),
  ('plaster', 'لبخ جدران وسقوف', 'Plastering', 'layers', 2),
  ('carpentry_form', 'نجارة بيوت وقالب', 'Form Carpentry', 'square', 3),
  ('flooring', 'تطبيق أرضيات', 'Flooring', 'grid', 4),
  ('chef', 'طباخ (شيف)', 'Chef', 'chef-hat', 5),
  ('plumbing', 'تأسيس ماء', 'Plumbing', 'droplet', 6),
  ('electric_setup', 'تأسيس كهرباء', 'Electrical Setup', 'zap', 7),
  ('electric_street', 'ربط كهرباء وتصليح أسلاك الشارع', 'Street Electric', 'cable', 8),
  ('washer_repair', 'تصليح غسالة', 'Washer Repair', 'washing-machine', 9),
  ('stove_repair', 'تصليح طباخ', 'Stove Repair', 'flame', 10),
  ('fridge_repair', 'تصليح ثلاجة', 'Fridge Repair', 'refrigerator', 11),
  ('ac_repair', 'تصليح وتنظيف سبلت', 'AC Service', 'wind', 12),
  ('cleaning', 'تنظيف بيوت', 'House Cleaning', 'sparkles', 13),
  ('wood_carpentry', 'نجارة أخشاب منزلية', 'Wood Carpentry', 'axe', 14),
  ('blacksmith', 'حدادة', 'Blacksmith', 'anvil', 15),
  ('general', 'خدمات منزلية عامة', 'General Home', 'home', 16);

-- ============ WORKER PROFILES ============
CREATE TABLE public.worker_profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level worker_level NOT NULL DEFAULT 'fani',
  available BOOLEAN NOT NULL DEFAULT false,
  bio TEXT,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  ratings_count INT NOT NULL DEFAULT 0,
  completed_jobs INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO authenticated;
GRANT ALL ON public.worker_profiles TO service_role;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worker profiles viewable by all" ON public.worker_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Worker manages own profile" ON public.worker_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Worker updates own profile" ON public.worker_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.worker_services (
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, service_id)
);
GRANT SELECT, INSERT, DELETE ON public.worker_services TO authenticated;
GRANT ALL ON public.worker_services TO service_role;
ALTER TABLE public.worker_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worker services viewable by all" ON public.worker_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Worker manages own services insert" ON public.worker_services FOR INSERT TO authenticated WITH CHECK (auth.uid() = worker_id);
CREATE POLICY "Worker manages own services delete" ON public.worker_services FOR DELETE TO authenticated USING (auth.uid() = worker_id);

-- ============ DRIVER PROFILES ============
CREATE TABLE public.driver_profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT false,
  vehicle_model TEXT,
  vehicle_plate TEXT,
  vehicle_color TEXT,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  ratings_count INT NOT NULL DEFAULT 0,
  completed_rides INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_profiles TO authenticated;
GRANT ALL ON public.driver_profiles TO service_role;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Driver profiles viewable by all" ON public.driver_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Driver manages own profile" ON public.driver_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Driver updates own profile" ON public.driver_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ SERVICE REQUESTS ============
CREATE TABLE public.service_requests (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type request_type NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  service_id UUID REFERENCES public.services(id),
  level_required worker_level,
  workers_count INT NOT NULL DEFAULT 1,
  pickup_text TEXT NOT NULL DEFAULT '',
  pickup_lat NUMERIC,
  pickup_lng NUMERIC,
  dest_text TEXT,
  dest_lat NUMERIC,
  dest_lng NUMERIC,
  notes TEXT,
  price_estimate NUMERIC,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- Customer sees own; provider sees assigned; pending requests visible to eligible providers
CREATE POLICY "Customer sees own requests"
  ON public.service_requests FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = provider_id);

CREATE POLICY "Drivers see pending taxi requests"
  ON public.service_requests FOR SELECT TO authenticated
  USING (status = 'pending' AND type = 'taxi' AND public.has_role(auth.uid(), 'driver'));

CREATE POLICY "Workers see pending service requests"
  ON public.service_requests FOR SELECT TO authenticated
  USING (status = 'pending' AND type = 'service' AND public.has_role(auth.uid(), 'worker'));

CREATE POLICY "Customer creates own requests"
  ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customer updates own request"
  ON public.service_requests FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Provider updates assigned or accepts pending"
  ON public.service_requests FOR UPDATE TO authenticated
  USING (auth.uid() = provider_id OR (status = 'pending' AND provider_id IS NULL));

-- ============ CHATS & MESSAGES ============
CREATE TABLE public.chats (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants see chat" ON public.chats FOR SELECT TO authenticated
  USING (auth.uid() IN (customer_id, provider_id));
CREATE POLICY "Chat participants create chat" ON public.chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (customer_id, provider_id));

CREATE TABLE public.messages (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND auth.uid() IN (c.customer_id, c.provider_id)));
CREATE POLICY "Chat participants send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND auth.uid() IN (c.customer_id, c.provider_id)));
CREATE POLICY "Receiver marks read" ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND auth.uid() IN (c.customer_id, c.provider_id) AND sender_id <> auth.uid()));

-- ============ RATINGS ============
CREATE TABLE public.ratings (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, rater_id)
);
GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ratings viewable by all" ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own ratings" ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rater_id);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER worker_profiles_updated_at BEFORE UPDATE ON public.worker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_requests_updated_at BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.service_requests REPLICA IDENTITY FULL;
