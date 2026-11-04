-- Fix chicken-and-egg: allow users to insert their own driver/worker profile
-- during onboarding, BEFORE the role is granted.

DROP POLICY IF EXISTS "Driver inserts own profile" ON public.driver_profiles;
CREATE POLICY "Driver inserts own profile" ON public.driver_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Worker inserts own profile" ON public.worker_profiles;
CREATE POLICY "Worker inserts own profile" ON public.worker_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Worker services policies
DROP POLICY IF EXISTS "Workers insert own services" ON public.worker_services;
CREATE POLICY "Workers insert own services" ON public.worker_services
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Workers delete own services" ON public.worker_services;
CREATE POLICY "Workers delete own services" ON public.worker_services
  FOR DELETE TO authenticated
  USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Workers view own services" ON public.worker_services;
CREATE POLICY "Workers view own services" ON public.worker_services
  FOR SELECT TO authenticated
  USING (auth.uid() = worker_id);

-- Live locations policies
DROP POLICY IF EXISTS "Users insert own location" ON public.live_locations;
CREATE POLICY "Users insert own location" ON public.live_locations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own location" ON public.live_locations;
CREATE POLICY "Users update own location" ON public.live_locations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages INSERT
DROP POLICY IF EXISTS "Users insert messages in own chats" ON public.messages;
CREATE POLICY "Users insert messages in own chats" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats c
      WHERE c.id = messages.chat_id
      AND (c.customer_id = auth.uid() OR c.provider_id = auth.uid())
    )
  );

-- Ratings INSERT
DROP POLICY IF EXISTS "Users insert own ratings" ON public.ratings;
CREATE POLICY "Users insert own ratings" ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rater_id);

-- Notifications INSERT (for server functions using anon key fallback)
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
CREATE POLICY "System inserts notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Chats INSERT/UPDATE (server functions create chats on accept)
DROP POLICY IF EXISTS "System inserts chats" ON public.chats;
CREATE POLICY "System inserts chats" ON public.chats
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "System updates chats" ON public.chats;
CREATE POLICY "System updates chats" ON public.chats
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Request offers INSERT (dispatch function)
DROP POLICY IF EXISTS "System inserts offers" ON public.request_offers;
CREATE POLICY "System inserts offers" ON public.request_offers
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Driver wallets INSERT/UPDATE (auto-created and updated on ride completion)
DROP POLICY IF EXISTS "System inserts wallets" ON public.driver_wallets;
CREATE POLICY "System inserts wallets" ON public.driver_wallets
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "System updates wallets" ON public.driver_wallets;
CREATE POLICY "System updates wallets" ON public.driver_wallets
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Transactions INSERT (ride earnings logging)
DROP POLICY IF EXISTS "System inserts transactions" ON public.transactions;
CREATE POLICY "System inserts transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (true);
