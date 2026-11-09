import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const SEND_EVERY_MS = 30_000;

/** Shares an available driver/technician's location so nearby ride and service requests can reach them. */
export function ProviderPresence() {
  const { session, roles } = useAuth();
  const uid = session?.user.id;
  const isProvider = roles.includes("driver") || roles.includes("worker");

  useEffect(() => {
    if (!uid || !isProvider || typeof navigator === "undefined" || !navigator.geolocation) return;
    let stopped = false;
    let last: GeolocationPosition | null = null;
    let lastSent = 0;

    async function isAvailable() {
      const [d, w] = await Promise.all([
        roles.includes("driver") ? supabase.from("driver_profiles").select("available").eq("user_id", uid!).maybeSingle() : Promise.resolve({ data: null }),
        roles.includes("worker") ? supabase.from("worker_profiles").select("available").eq("user_id", uid!).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return !!(d.data as any)?.available || !!(w.data as any)?.available;
    }

    async function send(force = false) {
      if (stopped || !last) return;
      if (!force && Date.now() - lastSent < SEND_EVERY_MS) return;
      if (!(await isAvailable())) return;
      lastSent = Date.now();
      await supabase.from("provider_presence").upsert({
        user_id: uid!,
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        heading: last.coords.heading ?? null,
      });
    }

    const watch = navigator.geolocation.watchPosition(
      (pos) => { last = pos; void send(); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    const timer = setInterval(() => void send(true), SEND_EVERY_MS);
    return () => { stopped = true; navigator.geolocation.clearWatch(watch); clearInterval(timer); };
  }, [uid, isProvider, roles.join(",")]);

  return null;
}
