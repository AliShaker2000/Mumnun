import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Coords = { lat: number; lng: number; heading?: number | null };

const MIN_DISTANCE_M = 15;
const MAX_INTERVAL_MS = 4000;

function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useLiveTracking(opts: {
  requestId: string | null;
  myUserId: string | null;
  otherUserId: string | null;
  myRole: "customer" | "provider";
  active: boolean;
}) {
  const { requestId, myUserId, otherUserId, myRole, active } = opts;
  const [me, setMe] = useState<Coords | null>(null);
  const [other, setOther] = useState<Coords | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastPushRef = useRef<Coords | null>(null);
  const lastPushTimeRef = useRef<number>(0);
  const channelRef = useRef<string>("");

  const push = (lat: number, lng: number, heading: number | null) => {
    if (!requestId || !myUserId) return;
    const now = Date.now();
    const coords: Coords = { lat, lng, heading };
    if (lastPushRef.current) {
      const dist = distanceMeters(lastPushRef.current, coords);
      const elapsed = now - lastPushTimeRef.current;
      if (dist < MIN_DISTANCE_M && elapsed < MAX_INTERVAL_MS) return;
    }
    lastPushRef.current = coords;
    lastPushTimeRef.current = now;
    supabase
      .from("live_locations")
      .upsert(
        {
          request_id: requestId,
          user_id: myUserId,
          role: myRole,
          lat,
          lng,
          heading,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "request_id,user_id" } as any
      )
      .then(({ error }: any) => {
        if (error) console.warn("[live-tracking] upsert error:", error.message);
      });
  };

  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading };
        setMe(c);
        push(c.lat, c.lng, c.heading ?? null);
      },
      (err) => { console.warn("[live-tracking] geolocation error:", err.message); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    watchRef.current = id;
    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [active, requestId, myUserId, myRole]);

  useEffect(() => {
    if (!active || !requestId || !otherUserId) return;
    const chName = `live-${requestId}-${Math.random().toString(36).slice(2, 8)}`;
    channelRef.current = chName;
    const ch = supabase
      .channel(chName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_locations", filter: `request_id=eq.${requestId}` },
        (payload: any) => {
          const row = payload.new;
          if (row.user_id === otherUserId) {
            setOther({ lat: row.lat, lng: row.lng, heading: row.heading });
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") console.warn("[live-tracking] channel error");
      });

    supabase
      .from("live_locations")
      .select("*")
      .eq("request_id", requestId)
      .eq("user_id", otherUserId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setOther({ lat: data.lat, lng: data.lng, heading: data.heading });
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [active, requestId, otherUserId]);

  return { me, other };
}
