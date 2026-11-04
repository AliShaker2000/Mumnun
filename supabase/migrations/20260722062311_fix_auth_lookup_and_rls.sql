-- 1. Create SECURITY DEFINER function for phone-to-email lookup
-- This allows the lookupAuthEmail server function to work with anon key
-- without exposing all profile data (only returns email for a given phone)
CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT email FROM public.profiles WHERE phone = _phone LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO anon, authenticated;

-- 2. Fix user_roles: allow self-assigning driver and worker roles too
DROP POLICY IF EXISTS "Users self-assign customer role" ON public.user_roles;

CREATE POLICY "Users self-assign own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role IN ('customer'::app_role, 'driver'::app_role, 'worker'::app_role));

-- 3. Add UPDATE policy for user_roles (allow self-update of own roles)
CREATE POLICY "Users update own roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Add DELETE policy for user_roles (allow self-delete of own roles)
CREATE POLICY "Users delete own roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5. Fix driver_wallets: add SELECT policy for owner
CREATE POLICY "Drivers view own wallet" ON public.driver_wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 6. Fix transactions: add SELECT policy for owner
CREATE POLICY "Users view own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 7. Add index on profiles.phone for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

-- 8. Add index on user_roles.user_id
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- 9. Add index on service_requests.status for provider queries
CREATE INDEX IF NOT EXISTS idx_service_requests_status_type ON public.service_requests(status, type);

-- 10. Add index on notifications.user_id for fast fetch
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- 11. Add index on messages.chat_id for fast message loading
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id, created_at);

-- 12. Add index on chats for user lookup
CREATE INDEX IF NOT EXISTS idx_chats_customer_id ON public.chats(customer_id);
CREATE INDEX IF NOT EXISTS idx_chats_provider_id ON public.chats(provider_id);

-- 13. Add index on ratings for request lookup
CREATE INDEX IF NOT EXISTS idx_ratings_request_id ON public.ratings(request_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater_id ON public.ratings(rater_id);

-- 14. Add index on live_locations for request lookup
CREATE INDEX IF NOT EXISTS idx_live_locations_request_id ON public.live_locations(request_id);

-- 15. Add index on request_offers for provider lookup
CREATE INDEX IF NOT EXISTS idx_request_offers_provider_status ON public.request_offers(provider_id, status);
