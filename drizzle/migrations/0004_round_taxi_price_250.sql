CREATE OR REPLACE FUNCTION public.round_to_250(n numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT round(n / 250) * 250 $$;
CREATE OR REPLACE FUNCTION public.round_taxi_price_estimate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type = 'taxi' AND NEW.price_estimate IS NOT NULL THEN NEW.price_estimate := public.round_to_250(NEW.price_estimate); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_taxi_round_price ON public.service_requests;
CREATE TRIGGER zz_taxi_round_price BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.round_taxi_price_estimate();