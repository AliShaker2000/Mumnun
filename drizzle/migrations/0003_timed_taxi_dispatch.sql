-- lovable-cron-fallback-reviewed: Time-based 60-second driver offers require persisted transitions; wake only on enqueue and unschedule after drain, 5-second delivery tolerance.
CREATE TABLE public.taxi_dispatch_queue (
 request_id uuid PRIMARY KEY REFERENCES public.service_requests(id) ON DELETE CASCADE,
 stage integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.taxi_dispatch_queue TO service_role;
ALTER TABLE public.taxi_dispatch_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX taxi_dispatch_next_at ON public.taxi_dispatch_queue(next_at);
ALTER TABLE public.request_offers ALTER COLUMN expires_at SET DEFAULT (now() + interval '60 seconds');
CREATE OR REPLACE FUNCTION public.advance_taxi_dispatch(_request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.service_requests%ROWTYPE; q public.taxi_dispatch_queue%ROWTYPE; v_radius numeric; v_min numeric; v_count integer;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE id = _request_id FOR UPDATE;
 SELECT * INTO q FROM public.taxi_dispatch_queue WHERE request_id = _request_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 IF r.status NOT IN ('pending','searching') OR r.provider_id IS NOT NULL THEN DELETE FROM public.taxi_dispatch_queue WHERE request_id = _request_id; RETURN 0; END IF;
 IF q.next_at > now() THEN RETURN 0; END IF;
 UPDATE public.request_offers SET status = 'expired', responded_at = now() WHERE request_id = _request_id AND status = 'pending' AND expires_at <= now();
 IF q.stage >= 3 THEN
   DELETE FROM public.taxi_dispatch_queue WHERE request_id = _request_id;
   UPDATE public.service_requests SET status = 'cancelled', cancellation_reason = 'لم يقبل أي سائق الطلب بعد انتهاء مراحل البحث', cancelled_by = NULL WHERE id = _request_id;
   UPDATE public.request_offers SET status = 'cancelled' WHERE request_id = _request_id AND status = 'pending';
   INSERT INTO public.notifications(user_id,type,title,body,link) VALUES (r.customer_id,'request_cancelled','أُلغي الطلب تلقائياً','لم يتوفر سائق يقبل طلبك؛ يمكنك المحاولة مرة أخرى','/request/' || _request_id);
   RETURN 0;
 END IF;
 v_radius := (ARRAY[2,5,10]::numeric[])[q.stage+1];
 v_min := (ARRAY[-1,2,5]::numeric[])[q.stage+1];
 WITH inserted AS (
   INSERT INTO public.request_offers(request_id,provider_id,distance_km,status,sent_at,expires_at)
   SELECT _request_id,d.user_id,d.distance_km,'pending',now(),now()+interval '60 seconds'
   FROM public.find_nearby_drivers(r.pickup_lat,r.pickup_lng,r.vehicle_category::text,v_radius,100) d
   WHERE d.distance_km > v_min AND d.user_id <> r.customer_id
     AND NOT EXISTS(SELECT 1 FROM public.request_offers o WHERE o.request_id=_request_id AND o.provider_id=d.user_id)
   ORDER BY d.distance_km LIMIT 10 ON CONFLICT(request_id,provider_id) DO NOTHING RETURNING provider_id
 )
 INSERT INTO public.notifications(user_id,type,title,body,link)
 SELECT provider_id,'ride_offer','طلب رحلة جديد','لديك دقيقة لقبول الرحلة من ' || COALESCE(r.pickup_text,'الموقع المحدد') || ' إلى ' || COALESCE(r.dest_text,'الوجهة المحددة'),'/request/' || _request_id FROM inserted;
 GET DIAGNOSTICS v_count = ROW_COUNT;
 UPDATE public.taxi_dispatch_queue SET stage=q.stage+1,next_at=now()+interval '60 seconds' WHERE request_id=_request_id;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.advance_taxi_dispatch(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_taxi_dispatch(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.process_taxi_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(91840060);
 FOR v_id IN SELECT request_id FROM public.taxi_dispatch_queue WHERE next_at<=now() ORDER BY next_at LIMIT 100 LOOP PERFORM public.advance_taxi_dispatch(v_id); END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.taxi_dispatch_queue) THEN PERFORM cron.unschedule('mamnoon-taxi-dispatch'); END IF;
END $$;
REVOKE ALL ON FUNCTION public.process_taxi_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_taxi_dispatch() TO service_role;
CREATE OR REPLACE FUNCTION public.prepare_taxi_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.type='taxi' THEN
   IF NEW.distance_km IS NULL OR NEW.distance_km < 0 OR NEW.pickup_lat IS NULL OR NEW.pickup_lng IS NULL OR NEW.dest_lat IS NULL OR NEW.dest_lng IS NULL THEN RAISE EXCEPTION 'مسافة الطريق ونقطتا الانطلاق والوجهة مطلوبة'; END IF;
   NEW.price_estimate := NEW.distance_km * 400; NEW.commission := 0; NEW.status := 'searching'; NEW.searching_started_at := now();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prepare_taxi_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER taxi_prepare BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.prepare_taxi_request();
CREATE OR REPLACE FUNCTION public.on_taxi_dispatch_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.type <> 'taxi' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(91840060);
 IF NEW.status IN ('pending','searching') AND NEW.provider_id IS NULL THEN
   IF TG_OP='INSERT' OR OLD.status NOT IN ('pending','searching') THEN
     INSERT INTO public.taxi_dispatch_queue(request_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
     PERFORM public.advance_taxi_dispatch(NEW.id);
     PERFORM cron.schedule('mamnoon-taxi-dispatch','5 seconds','SELECT public.process_taxi_dispatch()');
   END IF;
 ELSE
   DELETE FROM public.taxi_dispatch_queue WHERE request_id=NEW.id;
   UPDATE public.request_offers SET status='cancelled',responded_at=now() WHERE request_id=NEW.id AND status='pending' AND provider_id IS DISTINCT FROM NEW.provider_id;
   IF NOT EXISTS(SELECT 1 FROM public.taxi_dispatch_queue) THEN PERFORM cron.unschedule('mamnoon-taxi-dispatch'); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.on_taxi_dispatch_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER taxi_dispatch_changed AFTER INSERT OR UPDATE OF status ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.on_taxi_dispatch_change();
CREATE OR REPLACE FUNCTION public.accept_service_request(_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid; v_updated integer; r public.service_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF NOT (public.has_role(auth.uid(),'driver') OR public.has_role(auth.uid(),'worker')) THEN RAISE EXCEPTION 'provider_role_required'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_blocks b WHERE b.user_id=auth.uid() AND (b.expires_at IS NULL OR b.expires_at>now())) THEN RAISE EXCEPTION 'user_blocked'; END IF;
 PERFORM pg_advisory_xact_lock(91840060);
 SELECT * INTO r FROM public.service_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('pending','searching') OR r.provider_id IS NOT NULL THEN RAISE EXCEPTION 'request_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_requests WHERE provider_id=auth.uid() AND status IN ('accepted','in_progress')) THEN RAISE EXCEPTION 'لديك رحلة نشطة بالفعل'; END IF;
 UPDATE public.service_requests SET provider_id=auth.uid(),status='accepted',accepted_at=now()
 WHERE id=_request_id AND ((type='taxi' AND public.has_role(auth.uid(),'driver') AND EXISTS(
 SELECT 1 FROM public.request_offers o WHERE o.request_id=_request_id AND o.provider_id=auth.uid() AND o.status='pending' AND o.expires_at>now()))
 OR (type='service' AND public.has_role(auth.uid(),'worker') AND (service_id IS NULL OR EXISTS(SELECT 1 FROM public.worker_services ws WHERE ws.worker_id=auth.uid() AND ws.service_id=service_requests.service_id))))
 RETURNING customer_id INTO v_customer;
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 IF v_updated=0 THEN RAISE EXCEPTION 'request_unavailable'; END IF;
 INSERT INTO public.chats(request_id,customer_id,provider_id) VALUES(_request_id,v_customer,auth.uid()) ON CONFLICT(request_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,updated_at=now();
 UPDATE public.request_offers SET status='accepted',responded_at=now() WHERE request_id=_request_id AND provider_id=auth.uid();
 INSERT INTO public.notifications(user_id,type,title,body,link) VALUES(v_customer,'request_accepted','تم قبول طلبك','مقدّم الخدمة في الطريق إليك','/request/' || _request_id);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.accept_service_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reject_request_offer(_offer_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 UPDATE public.request_offers SET status='rejected',responded_at=now() WHERE id=_offer_id AND provider_id=auth.uid() AND status='pending' AND expires_at>now();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.reject_request_offer(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_request_offer(uuid) TO authenticated;
DROP POLICY "Provider updates own offer" ON public.request_offers;
REVOKE UPDATE ON public.request_offers FROM authenticated;