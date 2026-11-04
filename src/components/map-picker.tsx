import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { getCurrentLocation, locationError } from "@/lib/location";
import { lookupMapPlace } from "@/lib/maps.functions";
import { Loader2, MapPin, Crosshair, Search, X, CheckCircle2, Maximize2, Minimize2 } from "lucide-react";
import type { ProviderPin } from "@/lib/use-nearby-providers";

type Coords = { lat: number; lng: number };

const DEFAULT_CENTER: Coords = { lat: 33.3152, lng: 44.3661 };

export function MapPicker({
  value,
  onChange,
  height = 280,
  accent = "#0ea5e9",
  placeholder = "ابحث عن مكان...",
  nearby,
  nearbyKind = "car",
  autoLocateOnMount = false,
  showLocateButton = true,
  onConfirm,
  confirmLabel = "تأكيد الموقع",
  isFullScreen = false,
  hideOutsideButtons = false,
  searchTop,
  bottomOffset = 0,
  onSelectPlace,
}: {
  value: Coords | null;
  onChange: (c: Coords, address?: string) => void;
  height?: number | string;
  accent?: string;
  placeholder?: string;
  nearby?: ProviderPin[];
  nearbyKind?: "car" | "worker";
  autoLocateOnMount?: boolean;
  showLocateButton?: boolean;
  onConfirm?: () => void;
  confirmLabel?: string;
  isFullScreen?: boolean;
  hideOutsideButtons?: boolean;
  searchTop?: number;
  bottomOffset?: number;
  onSelectPlace?: (c: Coords, address?: string) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState(false);
  const report = (c: Coords, addr?: string) => {
    setPicked(true);
    onChangeRef.current(c, addr);
  };
  const reverseFallback = (c: Coords) => {
    lookupMapPlace({ data: { action: "reverse", center: c } })
      .then((r: any) => { if (r?.address) { setAddress(r.address); onChangeRef.current(c, r.address); } })
      .catch(() => {});
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const idleTimerRef = useRef<any>(null);
  const suppressIdleRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string>("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [sharedOk, setSharedOk] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; secondary: string }>>([]);
  const sessionTokenRef = useRef<any>(null);
  const acServiceRef = useRef<any>(null);
  const placesSvcRef = useRef<any>(null);
  const nearbyMarkersRef = useRef<
    Map<string, { marker: any; anim: { from: Coords; to: Coords; startedAt: number; raf: number | null; heading: number } | null }>
  >(new Map());
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => {
      if (!readyRef.current && !cancelled) {
        setLoading(false);
        setError("الخريطة بطيئة بالتحميل، تقدر تشارك موقعك مباشرة");
      }
    }, 12000);
    loadGoogleMaps()
      .then((g) => {
        clearTimeout(slow);
        if (cancelled || !containerRef.current) return;
        const center = value ?? DEFAULT_CENTER;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom: 14,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        // Don't report the default city centre as the user's location.
        if (!value) suppressIdleRef.current = true;
        geocoderRef.current = new g.maps.Geocoder();

        const marker = new g.maps.Marker({
          position: center,
          map,
          draggable: true,
          animation: g.maps.Animation?.DROP,
        });

        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const c = { lat: pos.lat(), lng: pos.lng() };
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            if (suppressIdleRef.current) {
              suppressIdleRef.current = false;
              return;
            }
            geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
              if (status === "OK" && results?.[0]) {
                const addr = results[0].formatted_address;
                setAddress(addr);
                report(c, addr);
              } else {
                report(c);
                reverseFallback(c);
              }
            });
          }, 300);
        });

        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          const c = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          marker.setPosition(e.latLng);
          map.panTo(e.latLng);
          suppressIdleRef.current = false;
          geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
            if (status === "OK" && results?.[0]) {
              const addr = results[0].formatted_address;
              setAddress(addr);
              report(c, addr);
            } else {
              report(c);
              reverseFallback(c);
            }
          });
        });

        map.addListener("idle", () => {
          if (suppressIdleRef.current) {
            suppressIdleRef.current = false;
            return;
          }
          const center = map.getCenter();
          if (!center) return;
          const c = { lat: center.lat(), lng: center.lng() };
          marker.setPosition(center);
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
              if (status === "OK" && results?.[0]) {
                const addr = results[0].formatted_address;
                setAddress(addr);
                report(c, addr);
              } else {
                report(c);
                reverseFallback(c);
              }
            });
          }, 500);
        });

        setLoading(false);
        readyRef.current = true;
      })
      .catch((e) => {
        clearTimeout(slow);
        console.error("map init failed", e);
        if (!cancelled) setError("تعذّر تحميل الخريطة. تحقق من اتصال الإنترنت.");
      });

    return () => {
      cancelled = true;
      clearTimeout(slow);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !value) return;
    suppressIdleRef.current = true;
    mapRef.current.panTo(value);
  }, [value]);

  useEffect(() => {
    if (!nearby?.length || !mapRef.current) return;
    const g = (window as any).google;
    if (!g) return;

    nearby.forEach((pin) => {
      const existing = nearbyMarkersRef.current.get(pin.pin_id);
      if (existing) {
        if (existing.anim) {
          cancelAnimationFrame(existing.anim.raf ?? 0);
        }
        const from = existing.marker.getPosition?.();
        const fromCoords: Coords = from ? { lat: from.lat(), lng: from.lng() } : { lat: pin.lat, lng: pin.lng };
        existing.anim = {
          from: fromCoords,
          to: { lat: pin.lat, lng: pin.lng },
          startedAt: Date.now(),
          raf: null,
          heading: pin.heading ?? 0,
        };
        const animate = () => {
          if (!existing.anim) return;
          const elapsed = Date.now() - existing.anim.startedAt;
          const t = Math.min(1, elapsed / 1000);
          const easeT = 1 - Math.pow(1 - t, 3);
          const lat = existing.anim.from.lat + (existing.anim.to.lat - existing.anim.from.lat) * easeT;
          const lng = existing.anim.from.lng + (existing.anim.to.lng - existing.anim.from.lng) * easeT;
          existing.marker.setPosition({ lat, lng });
          if (t < 1) {
            existing.anim.raf = requestAnimationFrame(animate);
          } else {
            existing.anim = null;
          }
        };
        existing.anim.raf = requestAnimationFrame(animate);
      } else {
        const icon: any = {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: nearbyKind === "worker" ? "#10b981" : "#3b82f6",
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 2,
        };
        const m = new g.maps.Marker({
          position: { lat: pin.lat, lng: pin.lng },
          map: mapRef.current,
          icon,
        });
        nearbyMarkersRef.current.set(pin.pin_id, { marker: m, anim: null });
      }
    });

    const currentIds = new Set(nearby.map((p) => p.pin_id));
    nearbyMarkersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.marker.setMap(null);
        if (entry.anim) cancelAnimationFrame(entry.anim.raf ?? 0);
        nearbyMarkersRef.current.delete(id);
      }
    });
  }, [nearby, nearbyKind]);

  function autoLocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("جهازك لا يدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    setGeoError(null);
    getCurrentLocation(navigator.geolocation)
      .then((c) => {
        setSharedOk(true);
        setLocating(false);
        if (mapRef.current) {
          suppressIdleRef.current = true;
          mapRef.current.panTo(c);
          mapRef.current.setZoom(16);
        }
        report(c);
        reverseFallback(c);
        try {
          geocoderRef.current?.geocode({ location: c }, (results: any, status: any) => {
            if (status === "OK" && results?.[0]) {
              const addr = results[0].formatted_address;
              setAddress(addr);
              report(c, addr);
            }
          });
        } catch {
          /* address optional */
        }
      })
      .catch((err) => {
        setLocating(false);
        setGeoError(locationError(err ?? {}));
      });
  }

  useEffect(() => {
    if (autoLocateOnMount && !value) autoLocate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place search: Google Places (via our server) first, OpenStreetMap as backup.
  const placeCacheRef = useRef<Map<string, { coords: Coords; address: string }>>(new Map());
  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let stale = false;
    const q = searchQuery.trim();
    const timer = setTimeout(async () => {
      if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
      const center = mapRef.current?.getCenter?.();
      const c = center
        ? { lat: typeof center.lat === "function" ? center.lat() : center.lat, lng: typeof center.lng === "function" ? center.lng() : center.lng }
        : value ?? DEFAULT_CENTER;
      try {
        const res: any = await lookupMapPlace({ data: { action: "autocomplete", input: q, sessionToken: sessionTokenRef.current, center: c } });
        if (stale) return;
        if (res.suggestions?.length) {
          setSuggestions(res.suggestions.map((s: any) => ({ id: "g:" + s.id, text: s.text, secondary: "" })));
          return;
        }
      } catch {
        /* fall back below */
      }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=iq&accept-language=ar&limit=6`);
        const data = await r.json();
        if (stale) return;
        setSuggestions(
          (data || []).map((d: any) => {
            const id = "o:" + d.place_id;
            const parts = String(d.display_name || "").split(",");
            placeCacheRef.current.set(id, { coords: { lat: parseFloat(d.lat), lng: parseFloat(d.lon) }, address: d.display_name });
            return { id, text: d.name || parts[0], secondary: parts.slice(1, 3).join("،").trim() };
          }),
        );
      } catch {
        if (!stale) setSuggestions([]);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchOpen]);

  async function pickSuggestion(id: string, label: string) {
    let place = placeCacheRef.current.get(id);
    if (!place && id.startsWith("g:")) {
      try {
        const res: any = await lookupMapPlace({ data: { action: "details", placeId: id.slice(2), sessionToken: sessionTokenRef.current ?? crypto.randomUUID() } });
        place = { coords: res.coords, address: res.address || label };
      } catch {
        setGeoError("تعذّر فتح هذا المكان، جرّب مكان ثاني");
        return;
      }
      sessionTokenRef.current = null;
    }
    if (!place) return;
    const addr = place.address || label;
    setAddress(addr);
    setSearchOpen(false);
    setSuggestions([]);
    setSearchQuery("");
    suppressIdleRef.current = true;
    if (mapRef.current) {
      mapRef.current.panTo(place.coords);
      mapRef.current.setZoom(16);
    }
    report(place.coords, addr);
    onSelectPlaceRef.current?.(place.coords, addr);
  }

  return (
    <>
    <div
      className={
        isFullScreen
          ? "absolute inset-0 w-full h-full overflow-hidden"
          : full
          ? "fixed inset-0 z-[60] overflow-hidden bg-background"
          : "relative rounded-3xl overflow-hidden border border-border shadow-sm"
      }
      style={{ height: isFullScreen ? "100%" : full ? "100dvh" : height }}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ background: "#e5edf5" }} />

      {!loading && !error && (
        <div className="absolute top-3 left-3 right-3 z-10" style={searchTop != null ? { top: searchTop } : undefined}>
          <div className="flex items-center gap-2 bg-white rounded-2xl shadow-lg px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              onFocus={() => setSearchOpen(true)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-sm font-medium min-w-0"
            />
            {searchOpen && (
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSuggestions([]);
                  setSearchQuery("");
                }}
                className="text-muted-foreground"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchOpen && suggestions.length > 0 && (
            <div className="mt-2 bg-white rounded-2xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSuggestion(s.id, s.text)}
                  className="w-full text-right px-3 py-2.5 border-b last:border-b-0 border-border/40 active:bg-muted flex items-start gap-2"
                >
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{s.text}</div>
                    {s.secondary && (
                      <div className="text-[11px] text-muted-foreground truncate">{s.secondary}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center z-[5]">
          <div className="flex flex-col items-center -translate-y-3">
            <div
              className="h-10 w-10 rounded-full grid place-items-center shadow-xl animate-in zoom-in-50 duration-200 border-2 border-white ring-2 ring-black/10"
              style={{ background: accent }}
            >
              <MapPin className="h-5 w-5 text-white" fill="white" />
            </div>
            <div className="h-2 w-3 rounded-full bg-black/40 -mt-0.5 shadow" />
          </div>
        </div>
      )}

      {!loading && !error && address && !isFullScreen && (
        <div className={`absolute ${full ? "bottom-24" : "bottom-3"} left-3 right-16 bg-white/95 backdrop-blur rounded-2xl px-3 py-2 shadow-lg z-10`}>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">الموقع المحدد</div>
          <div className="text-xs font-bold truncate">{address}</div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-white/60 z-20">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: accent }} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center text-center px-4 bg-white/80">
          <div className="text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MapPin className="h-5 w-5" />
            {error}
            <button
              type="button"
              onClick={() => autoLocate()}
              disabled={locating}
              className="mt-2 px-5 py-3 rounded-2xl font-bold text-white shadow-lg flex items-center gap-2 disabled:opacity-70"
              style={{ background: accent }}
            >
              {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
              {sharedOk ? "تمت مشاركة موقعك ✓" : "شارك موقعي الحالي"}
            </button>
          </div>
        </div>
      )}

      {geoError && (
        <div className="absolute bottom-16 left-3 right-3 z-30 bg-destructive text-destructive-foreground rounded-2xl px-3 py-2 text-xs font-bold shadow-lg flex items-start gap-2">
          <span className="flex-1">{geoError}</span>
          <button type="button" onClick={() => setGeoError(null)} aria-label="إغلاق"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!isFullScreen && (
        <button
          type="button"
          onClick={() => { setFull((f) => !f); setTimeout(() => window.dispatchEvent(new Event("resize")), 60); }}
          className={`absolute ${full ? "bottom-40" : "bottom-16"} right-3 h-11 w-11 rounded-full bg-white shadow-lg grid place-items-center btn-press z-10`}
          aria-label={full ? "تصغير الخريطة" : "خريطة بشاشة كاملة"}
        >
          {full ? <Minimize2 className="h-5 w-5" style={{ color: accent }} /> : <Maximize2 className="h-5 w-5" style={{ color: accent }} />}
        </button>
      )}

      {full && onConfirm && !isFullScreen && (
        <div className="absolute bottom-0 inset-x-0 p-4 z-30 bg-gradient-to-t from-background to-transparent">
          <button
            type="button"
            disabled={!value && !picked}
            onClick={() => { setFull(false); onConfirm(); setTimeout(() => window.dispatchEvent(new Event("resize")), 60); }}
            className="w-full h-14 rounded-2xl font-black text-base text-primary-foreground shadow-xl btn-press disabled:opacity-50"
            style={{ background: accent }}
          >
            {confirmLabel} ✓
          </button>
        </div>
      )}

      {!loading && !error && (
        <button
          type="button"
          onClick={() => autoLocate()}
          disabled={locating}
          style={{ bottom: bottomOffset ? `${bottomOffset + 14}px` : undefined }}
          className={`absolute ${bottomOffset ? "" : full ? "bottom-24" : "bottom-3"} right-3 h-12 w-12 rounded-full bg-white shadow-xl border border-border/40 grid place-items-center btn-press disabled:opacity-70 z-20`}
          aria-label="موقعي الحالي"
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: accent }} />
          ) : (
            <Crosshair className="h-5 w-5" style={{ color: accent }} />
          )}
        </button>
      )}
    </div>
    {!hideOutsideButtons && !isFullScreen && onConfirm && (
      <button
        type="button"
        disabled={!value && !picked}
        onClick={onConfirm}
        className="mt-3 w-full h-14 rounded-2xl font-black text-base shadow-lg flex items-center justify-center gap-2 btn-press disabled:opacity-50 bg-foreground text-background"
      >
        <CheckCircle2 className="h-5 w-5" /> {confirmLabel}
      </button>
    )}
    {!hideOutsideButtons && !isFullScreen && showLocateButton && (
      <button
        type="button"
        onClick={() => autoLocate()}
        disabled={locating}
        className="mt-3 w-full h-14 rounded-2xl font-black text-base shadow-lg flex items-center justify-center gap-2 btn-press disabled:opacity-80 text-primary-foreground"
        style={{ background: accent }}
      >
        {locating ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> جاري تحديد موقعك...</>
        ) : sharedOk ? (
          <><CheckCircle2 className="h-5 w-5" /> تم تحديد موقعك ✓ (اضغط للتحديث)</>
        ) : (
          <><Crosshair className="h-5 w-5" /> 📍 حدد موقعي الحالي تلقائياً</>
        )}
      </button>
    )}
    </>
  );
}

export function StaticMapPreview({
  coords,
  height = 140,
  accent = "#0ea5e9",
}: {
  coords: Coords;
  height?: number;
  accent?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current) return;
      const map = new g.maps.Map(containerRef.current, {
        center: coords,
        zoom: 15,
        disableDefaultUI: true,
        gestureHandling: "none",
        clickableIcons: false,
      });
      new g.maps.Marker({ position: coords, map });
    });
    return () => {
      cancelled = true;
    };
  }, [coords.lat, coords.lng]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden border border-border"
      style={{ height, background: "#e5edf5", borderColor: accent + "33" }}
    />
  );
}
