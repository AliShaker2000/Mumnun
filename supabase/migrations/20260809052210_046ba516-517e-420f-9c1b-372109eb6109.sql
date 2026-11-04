CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(p.email, ''), 'phone' || regexp_replace(p.phone, '[^0-9]', '', 'g') || '@mamnoon.app')
  FROM public.profiles p
  WHERE p.phone = _phone
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.lookup_email_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO service_role;