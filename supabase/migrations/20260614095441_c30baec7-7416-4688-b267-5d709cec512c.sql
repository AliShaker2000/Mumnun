-- Trigger function: when a new auth.users row is created, insert role into public.user_roles
-- The role is read from raw_user_meta_data->>'role' (e.g. set via signUp options.data.role).
-- Defaults to 'customer' if not provided or invalid. Provider roles (driver/worker)
-- still require the secure grantProviderRole server function to be granted later,
-- so this trigger only auto-assigns the 'customer' role here for safety.

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  final_role public.app_role;
BEGIN
  requested_role := NEW.raw_user_meta_data->>'role';

  -- Only allow self-assignment of 'customer' via trigger.
  -- driver/worker roles must be granted by the secure server function after onboarding.
  IF requested_role = 'customer' OR requested_role IS NULL THEN
    final_role := 'customer'::public.app_role;
  ELSE
    final_role := 'customer'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, final_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;

CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_role();