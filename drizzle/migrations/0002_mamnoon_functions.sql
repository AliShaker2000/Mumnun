CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email::text FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.phone = _phone LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.lookup_email_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_provider_role_safe(_role public.app_role)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _role NOT IN ('driver','worker') THEN RAISE EXCEPTION 'invalid_provider_role'; END IF;
  IF _role = 'driver' AND NOT EXISTS (SELECT 1 FROM public.driver_profiles WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'driver_profile_required'; END IF;
  IF _role = 'worker' AND NOT EXISTS (SELECT 1 FROM public.worker_profiles WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'worker_profile_required'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _role) ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.grant_provider_role_safe(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_provider_role_safe(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_nearby_drivers(_lat numeric, _lng numeric, _category text, _radius_km numeric DEFAULT 5, _limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, distance_km numeric, rating_avg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.user_id, x.distance_km, x.rating_avg FROM (
    SELECT DISTINCT ON (dp.user_id) dp.user_id, dp.rating_avg,
      (6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(_lat)) * cos(radians(ll.lat)) * cos(radians(ll.lng) - radians(_lng)) + sin(radians(_lat)) * sin(radians(ll.lat))))))::numeric AS distance_km
    FROM public.driver_profiles dp
    JOIN public.live_locations ll ON ll.user_id = dp.user_id
    WHERE dp.available AND dp.status = 'approved'
      AND (_category IS NULL OR dp.vehicle_category::text = _category)
      AND ll.updated_at > now() - interval '5 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.provider_id = dp.user_id AND sr.status IN ('accepted','in_progress'))
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = dp.user_id AND (b.expires_at IS NULL OR b.expires_at > now()))
    ORDER BY dp.user_id, ll.updated_at DESC
  ) x
  WHERE x.distance_km <= _radius_km
  ORDER BY x.distance_km ASC, x.rating_avg DESC NULLS LAST
  LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.find_nearby_drivers(numeric,numeric,text,numeric,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_drivers(numeric,numeric,text,numeric,int) TO service_role;

CREATE OR REPLACE FUNCTION public.find_nearby_provider_pins(_lat numeric, _lng numeric, _type text, _category text DEFAULT NULL, _service_id uuid DEFAULT NULL, _radius_km numeric DEFAULT 5, _limit int DEFAULT 30)
RETURNS TABLE(pin_id text, lat numeric, lng numeric, heading numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(ll.user_id::text), ll.lat::numeric, ll.lng::numeric, ll.heading::numeric
  FROM public.live_locations ll
  WHERE ll.updated_at > now() - interval '5 minutes' AND ll.role = 'provider'
    AND ((_type = 'taxi' AND EXISTS (SELECT 1 FROM public.driver_profiles dp WHERE dp.user_id = ll.user_id AND dp.available AND (_category IS NULL OR dp.vehicle_category::text = _category)))
      OR (_type = 'service' AND EXISTS (SELECT 1 FROM public.worker_profiles wp WHERE wp.user_id = ll.user_id AND wp.available
            AND (_service_id IS NULL OR EXISTS (SELECT 1 FROM public.worker_services ws WHERE ws.worker_id = wp.user_id AND ws.service_id = _service_id)))))
    AND 6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(_lat)) * cos(radians(ll.lat)) * cos(radians(ll.lng) - radians(_lng)) + sin(radians(_lat)) * sin(radians(ll.lat))))) <= _radius_km
  ORDER BY ll.updated_at DESC
  LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.find_nearby_provider_pins(numeric,numeric,text,text,uuid,numeric,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_provider_pins(numeric,numeric,text,text,uuid,numeric,int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_service_request(_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid; v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(auth.uid(), 'driver') OR public.has_role(auth.uid(), 'worker')) THEN RAISE EXCEPTION 'provider_role_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = auth.uid() AND (b.expires_at IS NULL OR b.expires_at > now())) THEN RAISE EXCEPTION 'user_blocked'; END IF;
  UPDATE public.service_requests
  SET provider_id = auth.uid(), status = 'accepted', accepted_at = now()
  WHERE id = _request_id AND status IN ('pending','searching') AND provider_id IS NULL
    AND ((type = 'taxi' AND public.has_role(auth.uid(), 'driver')
          AND EXISTS (SELECT 1 FROM public.request_offers o WHERE o.request_id = _request_id AND o.provider_id = auth.uid()))
      OR (type = 'service' AND public.has_role(auth.uid(), 'worker')
          AND (service_id IS NULL OR EXISTS (SELECT 1 FROM public.worker_services ws WHERE ws.worker_id = auth.uid() AND ws.service_id = service_requests.service_id))))
  RETURNING customer_id INTO v_customer;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'request_unavailable'; END IF;
  INSERT INTO public.chats (request_id, customer_id, provider_id) VALUES (_request_id, v_customer, auth.uid())
  ON CONFLICT (request_id) DO UPDATE SET provider_id = EXCLUDED.provider_id, updated_at = now();
  UPDATE public.request_offers SET status = 'accepted', responded_at = now() WHERE request_id = _request_id AND provider_id = auth.uid();
  DELETE FROM public.request_offers WHERE request_id = _request_id AND provider_id <> auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_customer, 'request_accepted', 'تم قبول طلبك', 'مقدّم الخدمة في الطريق إليك', '/request/' || _request_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.accept_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_service_request(_request_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT id, customer_id, provider_id, status INTO r FROM public.service_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF r.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'request_finished'; END IF;
  IF r.customer_id = auth.uid() THEN
    UPDATE public.service_requests SET status = 'cancelled', cancelled_by = auth.uid(), cancellation_reason = left(_reason, 500) WHERE id = _request_id;
    DELETE FROM public.request_offers WHERE request_id = _request_id;
    IF r.provider_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (r.provider_id, 'request_cancelled', 'أُلغي الطلب', COALESCE(left(_reason, 200), 'ألغى الزبون الطلب'), '/request/' || _request_id);
    END IF;
    RETURN 'cancelled';
  ELSIF r.provider_id = auth.uid() THEN
    UPDATE public.service_requests SET status = 'searching', provider_id = NULL, accepted_at = NULL,
      cancelled_by = auth.uid(), cancellation_reason = left(_reason, 500) WHERE id = _request_id;
    DELETE FROM public.request_offers WHERE request_id = _request_id AND provider_id = auth.uid();
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (r.customer_id, 'provider_released', 'نبحث عن مقدّم خدمة آخر', COALESCE(left(_reason, 200), 'اعتذر مقدّم الخدمة'), '/request/' || _request_id);
    RETURN 'released';
  END IF;
  RAISE EXCEPTION 'forbidden';
END $$;
REVOKE ALL ON FUNCTION public.cancel_service_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_service_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_service_request(_request_id uuid, _status public.request_status, _reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.service_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v FROM public.service_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF _status = 'cancelled' THEN PERFORM public.cancel_service_request(_request_id, _reason); RETURN true; END IF;
  IF v.provider_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status = 'in_progress' AND v.status = 'accepted' THEN
    UPDATE public.service_requests SET status = 'in_progress', started_at = now() WHERE id = _request_id; RETURN true;
  END IF;
  IF _status = 'completed' AND v.status = 'in_progress' THEN
    UPDATE public.service_requests SET status = 'completed', completed_at = now() WHERE id = _request_id; RETURN true;
  END IF;
  RAISE EXCEPTION 'invalid_status_transition';
END $$;
REVOKE ALL ON FUNCTION public.transition_service_request(uuid, public.request_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_service_request(uuid, public.request_status, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_request_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_commission numeric; v_earning numeric; v_pct numeric;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.provider_id IS NOT NULL THEN
    IF NEW.type = 'taxi' THEN
      UPDATE public.driver_profiles SET completed_rides = completed_rides + 1 WHERE user_id = NEW.provider_id;
    ELSE
      UPDATE public.worker_profiles SET completed_jobs = completed_jobs + 1 WHERE user_id = NEW.provider_id;
    END IF;
    IF NEW.price_estimate IS NOT NULL THEN
      SELECT commission_pct INTO v_pct FROM public.pricing_rules WHERE vehicle_category = NEW.vehicle_category::text LIMIT 1;
      v_pct := COALESCE(v_pct, 0);
      v_commission := ROUND(NEW.price_estimate * v_pct / 100);
      v_earning := NEW.price_estimate - v_commission;
      INSERT INTO public.driver_wallets (user_id, balance, total_earned, total_commission)
      VALUES (NEW.provider_id, v_earning, v_earning, v_commission)
      ON CONFLICT (user_id) DO UPDATE SET balance = driver_wallets.balance + v_earning,
        total_earned = driver_wallets.total_earned + v_earning,
        total_commission = driver_wallets.total_commission + v_commission, updated_at = now();
      INSERT INTO public.transactions (user_id, request_id, type, amount, note) VALUES (NEW.provider_id, NEW.id, 'earning', v_earning, 'كسب من الطلب');
      IF v_commission > 0 THEN
        INSERT INTO public.transactions (user_id, request_id, type, amount, note) VALUES (NEW.provider_id, NEW.id, 'commission', -v_commission, 'عمولة المنصة');
      END IF;
      UPDATE public.service_requests SET commission = v_commission WHERE id = NEW.id;
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (NEW.provider_id, 'earning', 'أرباح جديدة', 'تمت إضافة ' || v_earning::text || ' إلى محفظتك', '/profile');
    END IF;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.customer_id, 'request_completed', 'اكتمل الطلب', 'يرجى تقييم مقدّم الخدمة', '/request/' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.on_request_completed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_request_completed AFTER UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.on_request_completed();

CREATE OR REPLACE FUNCTION public.on_rating_inserted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.driver_profiles SET rating_avg = (SELECT AVG(stars)::numeric(3,2) FROM public.ratings WHERE ratee_id = NEW.ratee_id),
    ratings_count = (SELECT COUNT(*) FROM public.ratings WHERE ratee_id = NEW.ratee_id) WHERE user_id = NEW.ratee_id;
  UPDATE public.worker_profiles SET rating_avg = (SELECT AVG(stars)::numeric(3,2) FROM public.ratings WHERE ratee_id = NEW.ratee_id),
    ratings_count = (SELECT COUNT(*) FROM public.ratings WHERE ratee_id = NEW.ratee_id) WHERE user_id = NEW.ratee_id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.on_rating_inserted() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_rating_inserted AFTER INSERT ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.on_rating_inserted();

CREATE OR REPLACE FUNCTION public.get_provider_reputation(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric; v_prof numeric; v_punc numeric; v_qual numeric; v_cnt int; v_done int; v_score int;
  v_level text; v_name text; v_icon text; v_color text; v_badges jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(AVG(stars),5), COALESCE(AVG(professionalism),5), COALESCE(AVG(punctuality),5), COALESCE(AVG(quality),5), COUNT(*)
    INTO v_avg, v_prof, v_punc, v_qual, v_cnt FROM public.ratings WHERE ratee_id = p_user_id;
  SELECT COUNT(*) INTO v_done FROM public.service_requests WHERE provider_id = p_user_id AND status = 'completed';
  v_score := LEAST(1000, ROUND(v_avg * 100 + LEAST(v_done, 500))::int);
  IF v_done >= 200 AND v_avg >= 4.7 THEN v_level := 'diamond'; v_name := 'ماسي'; v_icon := '💎'; v_color := '#7DD3FC';
  ELSIF v_done >= 100 AND v_avg >= 4.5 THEN v_level := 'gold'; v_name := 'ذهبي'; v_icon := '🥇'; v_color := '#FFD700';
  ELSIF v_done >= 30 AND v_avg >= 4.0 THEN v_level := 'silver'; v_name := 'فضي'; v_icon := '🥈'; v_color := '#C0C0C0';
  ELSE v_level := 'bronze'; v_name := 'برونزي'; v_icon := '🥉'; v_color := '#CD7F32'; END IF;
  IF v_cnt >= 10 AND v_avg >= 4.8 THEN v_badges := v_badges || jsonb_build_object('code','top_rated','name_ar','الأعلى تقييماً','icon','⭐','color','#F59E0B'); END IF;
  IF v_cnt >= 5 AND v_punc >= 4.8 THEN v_badges := v_badges || jsonb_build_object('code','punctual','name_ar','دقيق بالمواعيد','icon','⏱️','color','#10B981'); END IF;
  IF v_cnt >= 5 AND v_qual >= 4.8 THEN v_badges := v_badges || jsonb_build_object('code','quality','name_ar','جودة عالية','icon','🏆','color','#6366F1'); END IF;
  IF v_done >= 100 THEN v_badges := v_badges || jsonb_build_object('code','veteran','name_ar','خبرة +100','icon','🎖️','color','#EF4444'); END IF;
  RETURN jsonb_build_object('score', v_score, 'level', v_level, 'level_name', v_name, 'level_icon', v_icon, 'level_color', v_color,
    'avg_stars', round(v_avg, 2), 'professionalism_avg', round(v_prof, 2), 'punctuality_avg', round(v_punc, 2), 'quality_avg', round(v_qual, 2),
    'ratings_count', v_cnt, 'completed_jobs', v_done, 'badges', v_badges);
END $$;
REVOKE ALL ON FUNCTION public.get_provider_reputation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_reputation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_friend_status(p_friend_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_avatar text; v_status text; v_avail boolean;
BEGIN
  SELECT full_name, avatar_url INTO v_name, v_avatar FROM public.profiles WHERE id = p_friend_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','inactive'); END IF;
  SELECT bool_or(available) INTO v_avail FROM (
    SELECT available FROM public.driver_profiles WHERE user_id = p_friend_id
    UNION ALL SELECT available FROM public.worker_profiles WHERE user_id = p_friend_id) s;
  IF v_avail IS NULL THEN v_status := 'not_provider';
  ELSIF EXISTS (SELECT 1 FROM public.service_requests WHERE provider_id = p_friend_id AND status IN ('accepted','in_progress')) THEN v_status := 'on_job';
  ELSIF v_avail THEN v_status := 'available';
  ELSE v_status := 'inactive'; END IF;
  RETURN jsonb_build_object('status', v_status, 'full_name', v_name, 'avatar_url', v_avatar);
END $$;
REVOKE ALL ON FUNCTION public.get_friend_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_status(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.search_profile_by_phone(_phone text)
RETURNS TABLE(id uuid, full_name text, phone text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.phone, p.avatar_url FROM public.profiles p
  WHERE p.phone = _phone
     OR (length(regexp_replace(_phone, '\D', '', 'g')) >= 7
         AND regexp_replace(p.phone, '\D', '', 'g') LIKE '%' || right(regexp_replace(_phone, '\D', '', 'g'), 10))
  LIMIT 10
$$;
REVOKE ALL ON FUNCTION public.search_profile_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_profile_by_phone(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_subscription(_user_id uuid)
RETURNS TABLE(plan_code text, plan_name_ar text, tier int, max_requests_per_month int, priority_weight int, offer_priority int,
  badge_label text, badge_color text, show_stats boolean, priority_support boolean, status text, current_period_end timestamptz,
  request_count int, auto_renew boolean, subscription_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.code, p.name_ar, p.tier, p.max_requests_per_month, p.priority_weight, p.offer_priority, p.badge_label, p.badge_color,
    p.show_stats, p.priority_support, COALESCE(us.status, 'active'), us.current_period_end, COALESCE(us.request_count, 0),
    COALESCE(us.auto_renew, false), (SELECT ss.subscription_enabled FROM public.subscription_settings ss WHERE ss.id = 1)
  FROM public.subscription_plans p
  LEFT JOIN public.user_subscriptions us ON us.user_id = _user_id AND us.plan_id = p.id AND us.status = 'active'
  WHERE p.id = COALESCE((SELECT x.plan_id FROM public.user_subscriptions x WHERE x.user_id = _user_id AND x.status = 'active'),
                        (SELECT y.id FROM public.subscription_plans y WHERE y.code = 'free'))
$$;

CREATE OR REPLACE FUNCTION public.check_request_allowed(_user_id uuid)
RETURNS TABLE(allowed boolean, reason text, plan_code text, requests_used int, requests_limit int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = _user_id AND (b.expires_at IS NULL OR b.expires_at > now())) THEN
    RETURN QUERY SELECT false, 'blocked'::text, NULL::text, 0, NULL::int; RETURN;
  END IF;
  SELECT * INTO s FROM public.get_user_subscription(_user_id) LIMIT 1;
  IF NOT FOUND OR NOT COALESCE(s.subscription_enabled, false) THEN
    RETURN QUERY SELECT true, 'system_disabled'::text, COALESCE(s.plan_code, 'free'), COALESCE(s.request_count, 0), s.max_requests_per_month; RETURN;
  END IF;
  IF s.max_requests_per_month IS NOT NULL AND s.request_count >= s.max_requests_per_month THEN
    RETURN QUERY SELECT false, 'limit_reached'::text, s.plan_code, s.request_count, s.max_requests_per_month; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'ok'::text, s.plan_code, s.request_count, s.max_requests_per_month;
END $$;

CREATE OR REPLACE FUNCTION public.increment_request_count(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_subscriptions SET
    request_count = CASE WHEN resets_count_period_start < now() - interval '30 days' THEN 1 ELSE request_count + 1 END,
    resets_count_period_start = CASE WHEN resets_count_period_start < now() - interval '30 days' THEN now() ELSE resets_count_period_start END
  WHERE user_id = _user_id AND status = 'active';
END $$;

CREATE OR REPLACE FUNCTION public.get_subscription_stats()
RETURNS TABLE(total_subscribers bigint, active_subscriptions bigint, expired_subscriptions bigint, monthly_revenue bigint, yearly_revenue bigint,
  free_count bigint, silver_count bigint, gold_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT COUNT(*) FROM public.user_subscriptions),
    (SELECT COUNT(*) FROM public.user_subscriptions WHERE status = 'active'),
    (SELECT COUNT(*) FROM public.user_subscriptions WHERE status = 'expired'),
    (SELECT COALESCE(SUM(amount),0)::bigint FROM public.subscription_payments WHERE status = 'paid' AND created_at >= date_trunc('month', now())),
    (SELECT COALESCE(SUM(amount),0)::bigint FROM public.subscription_payments WHERE status = 'paid' AND created_at >= date_trunc('year', now())),
    (SELECT COUNT(*) FROM public.profiles) - (SELECT COUNT(*) FROM public.user_subscriptions us JOIN public.subscription_plans p ON p.id = us.plan_id WHERE us.status = 'active' AND p.code <> 'free'),
    (SELECT COUNT(*) FROM public.user_subscriptions us JOIN public.subscription_plans p ON p.id = us.plan_id WHERE us.status = 'active' AND p.code = 'silver'),
    (SELECT COUNT(*) FROM public.user_subscriptions us JOIN public.subscription_plans p ON p.id = us.plan_id WHERE us.status = 'active' AND p.code = 'gold')
$$;

CREATE OR REPLACE FUNCTION public.handle_expired_subscriptions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; d int;
BEGIN
  WITH exp AS (
    UPDATE public.user_subscriptions SET status = 'expired'
    WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end < now() RETURNING user_id)
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT user_id, 'subscription_expired', 'انتهى اشتراكك', 'تم إرجاعك إلى الخطة المجانية', '/profile' FROM exp;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  FOREACH d IN ARRAY ARRAY[7,3,1] LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT us.user_id, 'subscription_expiring', 'اشتراكك ينتهي قريباً',
      'سينتهي اشتراك ' || p.name_ar || ' خلال ' || d || ' يوم', '/profile'
    FROM public.user_subscriptions us JOIN public.subscription_plans p ON p.id = us.plan_id
    WHERE us.status = 'active' AND us.current_period_end::date = (now() + make_interval(days => d))::date;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.get_user_subscription(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_request_allowed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_request_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_subscription_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_expired_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_subscription(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_request_allowed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_request_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_expired_subscriptions() TO service_role;

CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_target_type text, p_target_id text, p_details jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details) VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details)
$$;
REVOKE ALL ON FUNCTION public.log_admin_action(text,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_staff(p_level text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_level = 'super' AND NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_level = 'admin' AND NOT public.has_admin_access(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_level = 'staff' AND NOT public.has_staff_role(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_staff(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_first_super_admin'));
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'super_admin') ON CONFLICT DO NOTHING;
  PERFORM public.log_admin_action('bootstrap_first_super_admin', 'user', p_user_id::text);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_grant_role(p_target_user uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('super');
  IF p_role NOT IN ('admin','support','finance','moderator') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_target_user, p_role::public.app_role) ON CONFLICT DO NOTHING;
  PERFORM public.log_admin_action('grant_role', 'user', p_target_user::text, jsonb_build_object('role', p_role));
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(p_target_user uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('super');
  IF p_role NOT IN ('admin','support','finance','moderator') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_target_user AND role = p_role::public.app_role;
  PERFORM public.log_admin_action('revoke_role', 'user', p_target_user::text, jsonb_build_object('role', p_role));
END $$;

CREATE OR REPLACE FUNCTION public.admin_block_user(p_user_id uuid, p_reason text, p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('admin');
  IF public.is_super_admin(p_user_id) THEN RAISE EXCEPTION 'cannot_block_super_admin'; END IF;
  INSERT INTO public.user_blocks (user_id, blocked_by, reason, expires_at) VALUES (p_user_id, auth.uid(), p_reason, p_expires_at)
  ON CONFLICT (user_id) DO UPDATE SET blocked_by = EXCLUDED.blocked_by, reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, blocked_at = now();
  UPDATE public.driver_profiles SET available = false WHERE user_id = p_user_id;
  UPDATE public.worker_profiles SET available = false WHERE user_id = p_user_id;
  PERFORM public.log_admin_action('block_user', 'user', p_user_id::text, jsonb_build_object('reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_unblock_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('admin');
  DELETE FROM public.user_blocks WHERE user_id = p_user_id;
  PERFORM public.log_admin_action('unblock_user', 'user', p_user_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_provider_status(p_user_id uuid, p_type text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('admin');
  IF p_status NOT IN ('approved','suspended','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF p_type = 'driver' THEN
    UPDATE public.driver_profiles SET status = p_status, available = CASE WHEN p_status = 'approved' THEN available ELSE false END WHERE user_id = p_user_id;
  ELSIF p_type = 'worker' THEN
    UPDATE public.worker_profiles SET status = p_status, available = CASE WHEN p_status = 'approved' THEN available ELSE false END WHERE user_id = p_user_id;
  ELSE RAISE EXCEPTION 'invalid_type'; END IF;
  PERFORM public.log_admin_action('set_provider_status', p_type, p_user_id::text, jsonb_build_object('status', p_status));
END $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_request(p_request_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('admin');
  UPDATE public.service_requests SET status = 'cancelled', cancelled_by = auth.uid(), cancellation_reason = COALESCE(left(p_reason, 500), 'ألغته الإدارة')
  WHERE id = p_request_id AND status NOT IN ('completed','cancelled');
  DELETE FROM public.request_offers WHERE request_id = p_request_id;
  PERFORM public.log_admin_action('cancel_request', 'request', p_request_id::text, jsonb_build_object('reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reopen_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('admin');
  UPDATE public.service_requests SET status = 'searching', provider_id = NULL, accepted_at = NULL, searching_started_at = now(), cancellation_reason = NULL
  WHERE id = p_request_id AND status = 'cancelled';
  PERFORM public.log_admin_action('reopen_request', 'request', p_request_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_note text, p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delta numeric; v_bal numeric;
BEGIN
  PERFORM public.assert_staff('admin');
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  v_delta := CASE WHEN p_type = 'debit' THEN -p_amount ELSE p_amount END;
  INSERT INTO public.driver_wallets (user_id, balance) VALUES (p_user_id, v_delta)
  ON CONFLICT (user_id) DO UPDATE SET balance = driver_wallets.balance + v_delta, updated_at = now()
  RETURNING balance INTO v_bal;
  INSERT INTO public.transactions (user_id, type, amount, balance_after, note) VALUES (p_user_id, 'adjustment', v_delta, v_bal, p_note);
  PERFORM public.log_admin_action('adjust_wallet', 'user', p_user_id::text, jsonb_build_object('amount', v_delta, 'note', p_note));
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_coupon(p_id uuid, p_code text, p_type text, p_value numeric, p_max_uses int, p_expires_at timestamptz, p_active boolean, p_min_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_staff('admin');
  IF p_id IS NULL THEN
    INSERT INTO public.coupons (code, type, value, max_uses, expires_at, active, min_amount)
    VALUES (upper(trim(p_code)), p_type, p_value, p_max_uses, p_expires_at, p_active, p_min_amount) RETURNING id INTO v_id;
    PERFORM public.log_admin_action('create_coupon', 'coupon', v_id::text, jsonb_build_object('code', p_code));
  ELSE
    UPDATE public.coupons SET code = upper(trim(p_code)), type = p_type, value = p_value, max_uses = p_max_uses, expires_at = p_expires_at,
      active = p_active, min_amount = p_min_amount WHERE id = p_id RETURNING id INTO v_id;
    PERFORM public.log_admin_action('update_coupon', 'coupon', p_id::text, jsonb_build_object('code', p_code));
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_coupon(p_coupon_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('admin');
  DELETE FROM public.coupons WHERE id = p_coupon_id;
  PERFORM public.log_admin_action('delete_coupon', 'coupon', p_coupon_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('staff');
  UPDATE public.user_reports SET status = p_status, resolution_note = p_note, resolved_by = auth.uid(), resolved_at = now() WHERE id = p_report_id;
  PERFORM public.log_admin_action('resolve_report', 'report', p_report_id::text, jsonb_build_object('status', p_status));
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_friendship(p_user1_id uuid, p_user2_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('staff');
  DELETE FROM public.friends WHERE (user_id = p_user1_id AND friend_id = p_user2_id) OR (user_id = p_user2_id AND friend_id = p_user1_id);
  PERFORM public.log_admin_action('delete_friendship', 'user', p_user1_id::text, jsonb_build_object('other', p_user2_id));
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_friend_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('staff');
  DELETE FROM public.friend_requests WHERE id = p_request_id;
  PERFORM public.log_admin_action('delete_friend_request', 'friend_request', p_request_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_staff('staff');
  DELETE FROM public.messages WHERE id = p_message_id;
  PERFORM public.log_admin_action('delete_message', 'message', p_message_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(p_target text, p_title text, p_body text, p_single_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  PERFORM public.assert_staff('staff');
  INSERT INTO public.notifications (user_id, type, title, body)
  SELECT p.id, 'broadcast', p_title, p_body FROM public.profiles p
  WHERE CASE p_target
    WHEN 'all' THEN true
    WHEN 'drivers' THEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'driver')
    WHEN 'workers' THEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'worker')
    WHEN 'single' THEN p.id = p_single_user_id
    ELSE false END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_admin_action('broadcast_notification', 'notification', p_target, jsonb_build_object('title', p_title, 'sent', v_count));
  RETURN v_count;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'bootstrap_first_super_admin(uuid)','admin_grant_role(uuid,text)','admin_revoke_role(uuid,text)',
    'admin_block_user(uuid,text,timestamptz)','admin_unblock_user(uuid)','admin_set_provider_status(uuid,text,text)',
    'admin_cancel_request(uuid,text)','admin_reopen_request(uuid)','admin_adjust_wallet(uuid,numeric,text,text)',
    'admin_save_coupon(uuid,text,text,numeric,int,timestamptz,boolean,numeric)','admin_delete_coupon(uuid)',
    'admin_resolve_report(uuid,text,text)','admin_delete_friendship(uuid,uuid)','admin_delete_friend_request(uuid)',
    'admin_delete_message(uuid)','admin_broadcast_notification(text,text,text,uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;