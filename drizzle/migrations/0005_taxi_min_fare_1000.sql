CREATE OR REPLACE FUNCTION public.round_taxi_price_estimate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type = 'taxi' AND NEW.price_estimate IS NOT NULL THEN NEW.price_estimate := GREATEST(1000, public.round_to_250(NEW.price_estimate)); END IF;
  RETURN NEW;
END $$;