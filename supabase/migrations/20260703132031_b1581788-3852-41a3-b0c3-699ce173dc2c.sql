
REVOKE EXECUTE ON FUNCTION public.enforce_single_active_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_live_location_speed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_request_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_rating_inserted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
