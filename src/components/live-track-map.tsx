import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Loader2, Navigation, Maximize2, Minimize2, Compass, MapPin } from "lucide-react";
import { toast } from "@/lib/toast";

export type Coords = { lat: number; lng: number; heading?: number | null };

function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearingDeg(a: Coords, b: Coords) {
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const lambda1 = (a.lng * Math.PI) / 180;
  const lambda2 = (b.lng * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export interface LiveTrackMapProps {
  me: Coords | null;
  other: Coords | null;
  pickupCoords?: Coords | null;
  destCoords?: Coords | null;
  status?: string;
  myRole?: "customer" | "provider";
  serviceType?: "taxi" | "service";
  driverName?: string;
  driverPhone?: string;
  vehicleCategory?: string;
  meColor?: string;
  otherColor?: string;
  height?: number;
  follow?: boolean;
  onOpenNavigation?: () => void;
  fullscreen?: boolean;
  onClose?: () => void;
}

export function LiveTrackMap({
  me,
  other,
  pickupCoords,
  destCoords,
  status = "accepted",
  myRole = "customer",
  serviceType = "taxi",
  driverName = "الكابتن",
  meColor = "#0284c7",
  otherColor = "#16a34a",
  height = 280,
  follow = true,
  onOpenNavigation,
  fullscreen = false,
  onClose,
}: LiveTrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const readyRef = useRef(false);
  const didInitialFitRef = useRef(false);
  const arrivedNotifiedRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(fullscreen);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  const effectivePickup: Coords | null = pickupCoords ?? (myRole === "customer" ? me : other);
  const activeDriverCoord: Coords | null = myRole === "provider" ? me : other;

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
        onClose?.();
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [isFullscreen, onClose]);

  // Initialize Map
  useEffect(() => {
    let cancelled = false;
    setMapReady(false);
    setMapError(false);
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current || !g) return;
        const initialCenter = effectivePickup ??
          activeDriverCoord ?? { lat: 33.3152, lng: 44.3661 };
        const map = new g.maps.Map(containerRef.current, {
          center: initialCenter,
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        mapRef.current = map;
        readyRef.current = true;
        setMapReady(true);
        syncMapElements(false);
      })
      .catch(() => {
        if (!cancelled) setMapError(true);
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      didInitialFitRef.current = false;
      if (pickupMarkerRef.current) pickupMarkerRef.current.setMap(null);
      if (destMarkerRef.current) destMarkerRef.current.setMap(null);
      if (meMarkerRef.current) meMarkerRef.current.setMap(null);
      if (driverMarkerRef.current) driverMarkerRef.current.setMap(null);
      if (routeLineRef.current) routeLineRef.current.setMap(null);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  // Update Markers and Polyline
  function syncMapElements(animate: boolean) {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map || !readyRef.current) return;

    // 1. Pickup Marker (Blue pin badge)
    if (effectivePickup) {
      const pickupIcon = {
        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
        scale: 1.6,
        fillColor: "#0284c7",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        anchor: new g.maps.Point(12, 22),
      };
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.setPosition(effectivePickup);
      } else {
        pickupMarkerRef.current = new g.maps.Marker({
          position: effectivePickup,
          map,
          icon: pickupIcon,
          title: "نقطة الانطلاق (الركوب)",
          zIndex: 10,
        });
      }
    }

    // 2. Destination Marker (Rose pin badge)
    if (destCoords) {
      const destIcon = {
        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
        scale: 1.6,
        fillColor: "#e11d48",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        anchor: new g.maps.Point(12, 22),
      };
      if (destMarkerRef.current) {
        destMarkerRef.current.setPosition(destCoords);
      } else {
        destMarkerRef.current = new g.maps.Marker({
          position: destCoords,
          map,
          icon: destIcon,
          title: "وجهة الوصول",
          zIndex: 9,
        });
      }
    }

    // 3. Driver Vehicle Marker
    if (activeDriverCoord) {
      const heading =
        activeDriverCoord.heading ??
        (effectivePickup ? bearingDeg(activeDriverCoord, effectivePickup) : 0);
      const carIcon = {
        path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#16a34a", // Vibrant driver green
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
        rotation: heading,
      };

      if (driverMarkerRef.current) {
        if (animate) {
          driverMarkerRef.current.setPosition(activeDriverCoord);
          driverMarkerRef.current.setIcon(carIcon);
        } else {
          driverMarkerRef.current.setPosition(activeDriverCoord);
          driverMarkerRef.current.setIcon(carIcon);
        }
      } else {
        driverMarkerRef.current = new g.maps.Marker({
          position: activeDriverCoord,
          map,
          icon: carIcon,
          title: driverName,
          zIndex: 20,
        });
      }
    }

    // 4. Polyline: Driver -> Pickup (when on the way to customer)
    // or Driver -> Dest (when in progress)
    const targetPoint = status === "in_progress" && destCoords ? destCoords : effectivePickup;
    if (activeDriverCoord && targetPoint) {
      const path = [activeDriverCoord, targetPoint];
      if (routeLineRef.current) {
        routeLineRef.current.setPath(path);
      } else {
        routeLineRef.current = new g.maps.Polyline({
          path,
          map,
          geodesic: true,
          strokeColor: "#0284c7",
          strokeOpacity: 0.85,
          strokeWeight: 4,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
              offset: "0",
              repeat: "14px",
            },
          ],
        });
      }

      // Distance and ETA calculation
      const dist = haversineKm(activeDriverCoord, targetPoint);
      setDistanceKm(dist);
      const minutes = Math.max(1, Math.round((dist / 32) * 60)); // ~32 km/h city average
      setEtaMinutes(minutes);

      // Check arrival threshold (< 70m)
      if (dist < 0.07 && !arrivedNotifiedRef.current) {
        arrivedNotifiedRef.current = true;
        if (myRole === "customer") toast.success("الكابتن وصل إلى موقعك الآن! 🚗");
      }
    }

    // Camera fitting
    if (!didInitialFitRef.current && activeDriverCoord && effectivePickup) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend(activeDriverCoord);
      bounds.extend(effectivePickup);
      if (destCoords) bounds.extend(destCoords);
      map.fitBounds(bounds, 70);
      didInitialFitRef.current = true;
    } else if (follow && activeDriverCoord) {
      if (effectivePickup) {
        map.panTo({
          lat: (activeDriverCoord.lat + effectivePickup.lat) / 2,
          lng: (activeDriverCoord.lng + effectivePickup.lng) / 2,
        });
      } else {
        map.panTo(activeDriverCoord);
      }
    }
  }

  useEffect(() => {
    if (readyRef.current) syncMapElements(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDriverCoord?.lat,
    activeDriverCoord?.lng,
    activeDriverCoord?.heading,
    effectivePickup?.lat,
    effectivePickup?.lng,
    destCoords?.lat,
    destCoords?.lng,
    status,
  ]);

  function recenterBounds() {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    const bounds = new g.maps.LatLngBounds();
    if (activeDriverCoord) bounds.extend(activeDriverCoord);
    if (effectivePickup) bounds.extend(effectivePickup);
    if (destCoords) bounds.extend(destCoords);
    map.fitBounds(bounds, 80);
  }

  function centerOnDriver() {
    if (mapRef.current && activeDriverCoord) {
      mapRef.current.panTo(activeDriverCoord);
      mapRef.current.setZoom(17);
    }
  }

  function centerOnPickup() {
    if (mapRef.current && effectivePickup) {
      mapRef.current.panTo(effectivePickup);
      mapRef.current.setZoom(17);
    }
  }

  const content = (
    <div
      className={`overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-[80] rounded-none bg-background"
          : "relative rounded-3xl border border-border shadow-md"
      }`}
      style={{ height: isFullscreen ? "100dvh" : height }}
    >
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0 z-0 bg-muted" />

      {/* Top Floating Status & ETA Card */}
      <div className="absolute top-3 inset-x-3 z-10 flex flex-wrap gap-2 items-center justify-between pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-border/40 pointer-events-auto flex items-center gap-2.5">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div className="text-right">
            <div className="text-xs font-black flex items-center gap-1.5 text-foreground">
              <span>
                {!activeDriverCoord
                  ? "بانتظار مشاركة الموقع"
                  : status === "in_progress"
                    ? "في الطريق إلى الوجهة"
                    : myRole === "provider"
                      ? "موقع العميل"
                      : "الكابتن متجه إليك"}
              </span>
              {etaMinutes != null && (
                <span className="text-primary font-black">· ~{etaMinutes} دقيقة</span>
              )}
            </div>
            {distanceKm != null && (
              <div className="text-[11px] text-muted-foreground font-semibold">
                المسافة المتبقية:{" "}
                {distanceKm < 1
                  ? `${Math.round(distanceKm * 1000)} متر`
                  : `${distanceKm.toFixed(1)} كم`}
              </div>
            )}
          </div>
        </div>

        {/* Map View Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            type="button"
            onClick={centerOnDriver}
            className="h-10 w-10 rounded-2xl bg-white shadow-lg grid place-items-center btn-press border border-border/40 text-emerald-600"
            title="موقع الكابتن"
            aria-label="موقع الكابتن"
          >
            <Navigation className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={centerOnPickup}
            className="h-10 w-10 rounded-2xl bg-white shadow-lg grid place-items-center btn-press border border-border/40 text-sky-600"
            title="نقطة الركوب"
            aria-label="نقطة الركوب"
          >
            <MapPin className="h-4 w-4" />
          </Button>
          {myRole === "provider" && onOpenNavigation && (
            <Button
              type="button"
              onClick={onOpenNavigation}
              className="h-10 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center gap-1 btn-press border border-emerald-500 text-[10px] font-black"
              title="ملاحة"
              aria-label="ملاحة"
            >
              <span>ملاحة</span>
            </Button>
          )}
          <Button
            type="button"
            onClick={recenterBounds}
            className="h-10 w-10 rounded-2xl bg-white shadow-lg grid place-items-center btn-press border border-border/40 text-muted-foreground"
            title="إعادة ضبط الرؤية"
            aria-label="إعادة ضبط الرؤية"
          >
            <Compass className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (isFullscreen && onClose) onClose();
              else setIsFullscreen((f) => !f);
              setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
            }}
            className="h-10 w-10 rounded-2xl bg-white shadow-lg grid place-items-center btn-press border border-border/40 text-foreground"
            title={isFullscreen ? "تصغير" : "شاشة كاملة"}
            aria-label={isFullscreen ? "تصغير" : "شاشة كاملة"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Bottom Floating Legend & Progress */}
      <div className="absolute bottom-3 inset-x-3 z-10 flex flex-wrap gap-2 items-center justify-between pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-lg border border-border/40 pointer-events-auto flex items-center gap-3 text-[11px] font-bold">
          <span className="flex items-center gap-1.5 text-sky-700">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-sky-200" />
            نقطة الانطلاق
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 animate-pulse" />
            الكابتن {driverName}
          </span>
          {destCoords && (
            <span className="flex items-center gap-1.5 text-rose-700">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200" />
              الوجهة
            </span>
          )}
        </div>

        {isFullscreen && (
          <Button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              onClose?.();
              setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
            }}
            className="pointer-events-auto px-4 py-2 rounded-2xl bg-primary text-primary-foreground text-xs font-bold shadow-lg btn-press"
          >
            العودة للتفاصيل
          </Button>
        )}
      </div>

      {!mapReady && (
        <div className="absolute inset-0 grid place-items-center bg-white/70 z-20">
          {mapError ? (
            <div className="text-center text-sm text-foreground space-y-3">
              <p>تعذّر تحميل الخريطة؛ تحقق من الاتصال وأعد المحاولة.</p>
              <Button
                onClick={() => {
                  if (onClose) onClose();
                  else window.location.reload();
                }}
              >
                العودة
              </Button>
            </div>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          )}
        </div>
      )}
    </div>
  );
  return isFullscreen ? createPortal(content, document.body) : content;
}
