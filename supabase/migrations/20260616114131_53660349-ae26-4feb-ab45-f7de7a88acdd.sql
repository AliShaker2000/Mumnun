
REVOKE EXECUTE ON FUNCTION public.on_request_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_rating_inserted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_nearby_drivers(numeric,numeric,text,numeric,int) FROM PUBLIC, anon, authenticated;
