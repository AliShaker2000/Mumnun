import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader as Loader2, ArrowLeft, ArrowRight, MapPin, CircleCheck as CheckCircle2, User, Users, Compass, ChevronUp, ChevronDown } from "lucide-react";
import { MapPicker } from "@/components/map-picker";
import { dispatchRequest } from "@/lib/dispatch.functions";
import { useNearbyProviders } from "@/lib/use-nearby-providers";
import { lookupMapPlace } from "@/lib/maps.functions";
import {
  taxiFare,
  approxRoadKm,
  calculateFareBreakdown,
  FARE_TABLE,
  WEATHER_RATES,
  ROAD_RATES,
  type VehicleCategory,
  type WeatherCondition,
  type RoadCondition,
} from "@/lib/taxi-fares";
import { detectWeatherCondition, seasonalWeatherFallback } from "@/lib/weather";

const search = z.object({ type: z.enum(["taxi", "service"]).default("taxi") });

export const Route = createFileRoute("/request/new")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "طلب جديد | ممنون" },
      { name: "description", content: "حدد موقعك ووجهتك لطلب سيارة أو خدمة بسهولة وسرعة." },
      { property: "og:title", content: "طلب جديد | ممنون" },
      { property: "og:description", content: "حدد موقعك ووجهتك لطلب سيارة أو خدمة بسهولة وسرعة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: search,
  component: NewRequest,
});

type Service = { id: string; slug: string; name_ar: string };

const SERVICE_VISUALS: Record<string, { emoji: string; gradient: string }> = {
  build:            { emoji: "🧱", gradient: "from-orange-400 to-red-500" },
  plaster:          { emoji: "🪣", gradient: "from-amber-400 to-orange-500" },
  carpentry_form:   { emoji: "📐", gradient: "from-yellow-400 to-amber-600" },
  flooring:         { emoji: "🟫", gradient: "from-stone-400 to-stone-600" },
  chef:             { emoji: "👨‍🍳", gradient: "from-rose-400 to-pink-600" },
  plumbing:         { emoji: "🚰", gradient: "from-sky-400 to-blue-600" },
  electric_setup:   { emoji: "💡", gradient: "from-yellow-300 to-amber-500" },
  electric_street:  { emoji: "⚡", gradient: "from-yellow-400 to-orange-500" },
  washer_repair:    { emoji: "🧺", gradient: "from-cyan-400 to-blue-500" },
  stove_repair:     { emoji: "🔥", gradient: "from-orange-500 to-red-600" },
  fridge_repair:    { emoji: "🧊", gradient: "from-cyan-300 to-sky-500" },
  ac_repair:        { emoji: "❄️", gradient: "from-sky-300 to-cyan-500" },
  cleaning:         { emoji: "✨", gradient: "from-emerald-400 to-teal-500" },
  wood_carpentry:   { emoji: "🪵", gradient: "from-amber-600 to-yellow-800" },
  blacksmith:       { emoji: "⚒️", gradient: "from-slate-500 to-zinc-700" },
  general:          { emoji: "🏠", gradient: "from-indigo-400 to-purple-500" },
  goods_transport:  { emoji: "📦", gradient: "from-amber-500 to-orange-600" },
  furniture_moving: { emoji: "🛋️", gradient: "from-fuchsia-400 to-pink-600" },
  cargo_handling:   { emoji: "🚚", gradient: "from-blue-500 to-indigo-600" },
};

const DEFAULT_VISUAL = { emoji: "🛠️", gradient: "from-primary to-primary-glow" };

const VEHICLE_CATS: { key: VehicleCategory; label: string; emoji: string; gradient: string; eta: string; desc: string }[] = [
  { key: "economy", label: "ممنون اقتصادي", emoji: "🚗", gradient: "from-emerald-400 to-teal-500", eta: "3-5 د", desc: "توفير وسرعة في الوصول" },
  { key: "premium", label: "ممنون المتميز", emoji: "🚙", gradient: "from-sky-500 to-indigo-600", eta: "4-6 د", desc: "سيارة واسعة ومكيفة بالكامل" },
  { key: "luxury",  label: "ممنون فاخر",   emoji: "🏎️", gradient: "from-amber-400 to-orange-500", eta: "5-8 د", desc: "أحدث الموديلات وراحة استثنائية" },
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function NewRequest() {
  const { type } = Route.useSearch();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const runDispatch = useServerFn(dispatchRequest);

  // Common & Service State
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [level, setLevel] = useState<"fani" | "khabir">("fani");
  const [khabirMode, setKhabirMode] = useState<"alone" | "with_workers">("alone");
  const [workersCount, setWorkersCount] = useState(1);
  const [pricingMode, setPricingMode] = useState<"fixed" | "hourly" | "negotiable">("fixed");
  const [customerPrice, setCustomerPrice] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [workDescription, setWorkDescription] = useState("");

  // Taxi State
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("economy");
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>(() => seasonalWeatherFallback());
  const [roadCondition, setRoadCondition] = useState<RoadCondition>("normal");
  const [drawerExpanded, setDrawerExpanded] = useState(true);
  const [showFareDetails, setShowFareDetails] = useState(false);

  // Coordinates
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLabel, setPickupLabel] = useState("");
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destLabel, setDestLabel] = useState("");
  const [mapStep, setMapStep] = useState<"pickup" | "dest">("pickup");

  const [notes, setNotes] = useState("");
  const [routeKm, setRouteKm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Calculate distance whenever pickup and dest coords update
  useEffect(() => {
    if (!pickupCoords || !destCoords) {
      setRouteKm(null);
      return;
    }
    let stale = false;
    const approx = approxRoadKm(haversineKm(pickupCoords, destCoords));
    setRouteKm(approx);

    const t = setTimeout(() => {
      lookupMapPlace({ data: { action: "route", from: pickupCoords, to: destCoords } })
        .then((r: any) => {
          if (!stale && r?.distanceKm > 0) setRouteKm(Number(r.distanceKm.toFixed(2)));
        })
        .catch(() => {});
    }, 400);

    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, destCoords?.lat, destCoords?.lng]);

  useEffect(() => {
    if (!pickupCoords) return;
    const controller = new AbortController();
    detectWeatherCondition(pickupCoords.lat, pickupCoords.lng, controller.signal)
      .then(setWeatherCondition)
      .catch(() => {});
    return () => controller.abort();
  }, [pickupCoords?.lat, pickupCoords?.lng]);

  const nearby = useNearbyProviders({
    center: pickupCoords,
    type,
    category: type === "taxi" ? vehicleCategory : null,
    serviceId: type === "service" ? serviceId : null,
    radiusKm: 5,
    enabled: !!pickupCoords,
  });

  useEffect(() => {
    if (type === "service") {
      supabase
        .from("services")
        .select("id, slug, name_ar")
        .order("sort_order")
        .then(({ data }) => {
          setServices((data ?? []) as Service[]);
        });
    }
  }, [type]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  // Transition from Pickup to Destination step
  function advanceToDestination() {
    if (!pickupCoords) {
      toast.error("يرجى تحديد موقع الانطلاق أولاً");
      return;
    }
    setMapStep("dest");
    toast.success("تم تثبيت موقع الانطلاق! الآن حدد وجهة الوصول على الخريطة 🎯");

    // If destination not set yet, set a sensible initial position near pickup
    if (!destCoords && pickupCoords) {
      const initialDest = {
        lat: Number((pickupCoords.lat + 0.025).toFixed(6)),
        lng: Number((pickupCoords.lng + 0.022).toFixed(6)),
      };
      setDestCoords(initialDest);
      setDestLabel("وجهة مقترحة على المسار");
    }
  }

  // Submit Request
  async function submit() {
    if (!pickupCoords) {
      toast.error("يرجى تحديد موقع الانطلاق");
      return;
    }
    if (type === "taxi" && !destCoords) {
      toast.error("يرجى تحديد موقع الوجهة على الخريطة لحساب المسافة بدقة");
      return;
    }
    if (type === "service" && !serviceId) {
      toast.error("اختر الخدمة");
      return;
    }

    const finalWorkers =
      type === "service" && level === "khabir"
        ? khabirMode === "alone"
          ? 1
          : 1 + workersCount
        : workersCount;

    let priceEstimate: number | null = null;
    if (type === "taxi" && routeKm !== null) {
      priceEstimate = taxiFare(vehicleCategory, routeKm, {
        weather: weatherCondition,
        roadCondition,
      });
    }

    const priceNum = parseInt(customerPrice.replace(/[^0-9]/g, ""), 10);
    if (type === "service" && pricingMode !== "negotiable" && !(priceNum > 0)) {
      toast.error("اكتب المبلغ اللي تريد تدفعه");
      return;
    }
    if (type === "service" && pricingMode !== "negotiable" && priceNum % 250 !== 0) {
      toast.error("المبلغ لازم يكون من مضاعفات 250 دينار");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("service_requests")
        .insert({
          customer_id: session!.user.id,
          type,
          status: "pending",
          service_id: type === "service" ? serviceId : null,
          level_required: type === "service" ? level : null,
          workers_count: finalWorkers,
          vehicle_category: type === "taxi" ? vehicleCategory : null,
          price_estimate: priceEstimate,
          pickup_text: pickupLabel || "موقع محدد على الخريطة",
          pickup_lat: pickupCoords?.lat ?? null,
          pickup_lng: pickupCoords?.lng ?? null,
          dest_text: destLabel || null,
          dest_lat: destCoords?.lat ?? null,
          dest_lng: destCoords?.lng ?? null,
          notes: notes || null,
          distance_km: type === "taxi" && routeKm !== null ? Number(routeKm.toFixed(2)) : null,
          ...(type === "service"
            ? {
                pricing_mode: pricingMode,
                customer_price: pricingMode === "negotiable" ? null : priceNum,
                work_hours: pricingMode === "hourly" && workHours ? Number(workHours) : null,
                work_description: workDescription.trim() || null,
              }
            : {}),
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      toast.success("تم إرسال الطلب بنجاح!");
      if (type === "taxi") {
        runDispatch({ data: { requestId: data.id } }).catch((e) => console.warn("[dispatch]", e));
      }
      navigate({ to: "/request/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  // Active calculated taxi fare
  const activeFare =
    routeKm !== null
      ? taxiFare(vehicleCategory, routeKm, { weather: weatherCondition, roadCondition })
      : FARE_TABLE[vehicleCategory].minimum;

  const estimatedEtaMinutes =
    routeKm !== null ? Math.max(3, Math.round((routeKm / 32) * 60) + 3) : 5;

  /* =========================================================================
     1. TAXI VIEW: FULL-SCREEN INTERACTIVE MAP WITH AUTO TRANSITION & REAL PRICING
     ========================================================================= */
  if (type === "taxi") {
    const currentBreakdown = calculateFareBreakdown(
      vehicleCategory,
      routeKm ?? 0,
      { weather: weatherCondition, roadCondition }
    );

    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col bg-slate-900 select-none">
        {/* Full-Screen Real Map Canvas (Locked full screen like Baly) */}
        <div className="absolute inset-0 z-0">
          <MapPicker
            value={mapStep === "pickup" ? pickupCoords : destCoords}
            accent={mapStep === "pickup" ? "#0284c7" : "#e11d48"}
            nearby={mapStep === "pickup" ? nearby : undefined}
            nearbyKind="car"
            autoLocateOnMount
            placeholder={
              mapStep === "pickup"
                ? "ابحث عن موقع الانطلاق في بغداد..."
                : "ابحث عن وجهة الوصول..."
            }
            showLocateButton={true}
            isFullScreen={true}
            hideOutsideButtons={true}
            bottomOffset={mapStep === "pickup" ? 180 : drawerExpanded ? 360 : 130}
            confirmLabel={
              mapStep === "pickup" ? "تأكيد الانطلاق والانتقال للوجهة" : "تأكيد الوجهة"
            }
            onSelectPlace={(c, addr) => {
              if (mapStep === "pickup") {
                setPickupCoords(c);
                if (addr) setPickupLabel(addr);
                toast.success("تم اختيار موقع الانطلاق! جاري تحويلك للوجهة 🎯");
                setTimeout(() => {
                  advanceToDestination();
                }, 300);
              } else {
                setDestCoords(c);
                if (addr) setDestLabel(addr);
                setDrawerExpanded(true);
              }
            }}
            onConfirm={() => {
              if (mapStep === "pickup") {
                advanceToDestination();
              } else {
                toast.success("تم تأكيد الوجهة ✓");
                setDrawerExpanded(true);
              }
            }}
            onChange={(c, addr) => {
              if (mapStep === "pickup") {
                setPickupCoords(c);
                setPickupLabel(addr ?? `موقعي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
              } else {
                setDestCoords(c);
                setDestLabel(addr ?? `وجهتي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
              }
            }}
          />
        </div>

        {/* Floating Top Control Bar (Header & Step Switcher) */}
        <div className="relative z-30 pt-3 px-3 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? history.back() : navigate({ to: "/home" }))}
              className="h-11 w-11 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-border/40 grid place-items-center btn-press text-foreground shrink-0"
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </button>

            {/* 2-Step Toggle Pills: 1. Pickup | 2. Destination */}
            <div className="flex-1 bg-white/95 backdrop-blur-md rounded-2xl p-1 shadow-lg border border-border/40 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMapStep("pickup")}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 btn-press ${
                  mapStep === "pickup"
                    ? "bg-sky-600 text-white shadow-md scale-[1.02]"
                    : "text-muted-foreground hover:bg-slate-100"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-sky-300" />
                <span>١. الانطلاق</span>
                {pickupCoords && <CheckCircle2 className="h-3 w-3" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!pickupCoords) {
                    toast.error("حدد موقع الانطلاق أولاً");
                    return;
                  }
                  advanceToDestination();
                }}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 btn-press ${
                  mapStep === "dest"
                    ? "bg-rose-600 text-white shadow-md scale-[1.02]"
                    : "text-muted-foreground hover:bg-slate-100"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-300" />
                <span>٢. الوجهة</span>
                {destCoords && <CheckCircle2 className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* STEP 1 FLOATING POPUP: PICKUP CONFIRMATION & MANUAL SELECTION */}
        {mapStep === "pickup" && (
          <div className="mt-auto relative z-30 p-4 pb-6 bg-gradient-to-t from-slate-950 via-slate-900/90 to-transparent">
            <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 shadow-2xl border border-border/50 max-w-md mx-auto space-y-3 animate-in slide-in-from-bottom-5">
              <div className="flex items-center justify-between text-xs font-bold text-sky-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
                  الخطوة الأولى: تحديد موقع الانطلاق
                </span>
                <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-100 font-bold">
                  سحب يدوي أو بحث
                </span>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="h-9 w-9 rounded-2xl bg-sky-100 text-sky-600 grid place-items-center shrink-0 mt-0.5">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-sky-600">نقطة ركوب الكابتن</div>
                  <div className="text-sm font-black text-foreground truncate">
                    {pickupLabel || "حرك الخريطة لوضع الدبوس على موقعك بالضبط"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    اسحب الخريطة لتغيير مكانك يدوياً، أو اختر من الأماكن الشائعة أدناه
                  </div>
                </div>
              </div>

              {/* Quick Popular Baghdad Pickup Spots */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold">
                <span className="text-muted-foreground text-[10px] shrink-0">أماكن سريعة:</span>
                {[
                  { name: "المنصور", lat: 33.3152, lng: 44.3512 },
                  { name: "الكرادة", lat: 33.3032, lng: 44.4218 },
                  { name: "الجادرية", lat: 33.2755, lng: 44.3789 },
                  { name: "زيونة", lat: 33.3325, lng: 44.4521 },
                ].map((spot) => (
                  <button
                    key={spot.name}
                    type="button"
                    onClick={() => {
                      setPickupCoords({ lat: spot.lat, lng: spot.lng });
                      setPickupLabel(`بغداد - ${spot.name}`);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-700 border border-slate-200 shrink-0 btn-press transition"
                  >
                    📍 {spot.name}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!pickupCoords) {
                    setPickupCoords({ lat: 33.3152, lng: 44.3512 });
                    setPickupLabel("بغداد - المنصور (محدد يدوياً)");
                  }
                  advanceToDestination();
                }}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-sky-600 to-primary text-white font-black text-base shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 btn-press"
              >
                <span>تأكيد موقع الانطلاق والانتقال للوجهة</span>
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 BOTTOM DRAWER: DESTINATION, REAL PRICING, VEHICLES & DISPATCH */}
        {mapStep === "dest" && (
          <div className="mt-auto relative z-30 bg-white/98 backdrop-blur-xl rounded-t-[32px] shadow-2xl border-t border-border/60 max-w-lg mx-auto w-full transition-all duration-300 animate-in slide-in-from-bottom-8">
            {/* Drawer Handle & Expand Toggle */}
            <div
              onClick={() => setDrawerExpanded((e) => !e)}
              className="py-2.5 flex flex-col items-center justify-center cursor-pointer select-none"
            >
              <div className="w-12 h-1.5 rounded-full bg-slate-300 mb-1" />
              <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <span>تفاصيل الرحلة والأسعار الفعلية الحقيقية</span>
                {drawerExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </div>
            </div>

            <div className="px-5 pb-5 space-y-3.5 max-h-[75dvh] overflow-y-auto">
              {/* Route Summary Chips: allows clicking pickup chip to go back and edit pickup manually */}
              <div className="grid grid-cols-2 gap-2 text-right">
                <button
                  type="button"
                  onClick={() => setMapStep("pickup")}
                  className="bg-slate-50 hover:bg-slate-100 rounded-2xl p-2.5 border border-border/60 text-right btn-press transition"
                  title="اضغط لتعديل موقع الانطلاق يدوياً"
                >
                  <div className="text-[10px] font-bold text-sky-600 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> الانطلاق (تعديل ✏️):
                  </div>
                  <div className="text-xs font-bold truncate text-foreground mt-0.5">
                    {pickupLabel || "موقعي الحالي"}
                  </div>
                </button>

                <div className="bg-rose-50/70 rounded-2xl p-2.5 border border-rose-200/60 text-right">
                  <div className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> الوجهة 🎯:
                  </div>
                  <div className="text-xs font-bold truncate text-foreground mt-0.5">
                    {destLabel || "نقطة الوصول المحددة"}
                  </div>
                </div>
              </div>

              {/* Distance & Realistic Metrics Banner */}
              {routeKm !== null ? (
                <div className="bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 rounded-2xl p-3 border border-sky-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <div className="text-xs font-black text-foreground">
                        مسافة المسار: {routeKm.toFixed(1)} كم · وصول خلال ~{estimatedEtaMinutes} د
                      </div>
                      <div className="text-[10px] text-muted-foreground">تسعيرة حقيقية حسب مسافة الطريق الفعلية والطقس</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] bg-white px-2 py-1 rounded-full font-bold text-primary shadow-sm border border-primary/20">
                      دقة 100%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl p-2.5 text-center text-xs text-muted-foreground border border-dashed border-border">
                  حرك الخريطة لتحديد نقطة الوصول لحساب المسافة
                </div>
              )}

              {/* Expanded details: Climate & Road Traffic Adjustments */}
              {drawerExpanded && (
                <>
                  {/* Road Traffic Factor (Normal vs Rush Hour Traffic) */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                      <span>🚦 حالة الطريق وحركة السير</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRoadCondition("normal")}
                        className={`py-2 px-3 rounded-2xl text-xs font-bold transition-all btn-press border flex items-center justify-center gap-1.5 ${
                          roadCondition === "normal"
                            ? "bg-emerald-600 text-white border-emerald-700 shadow"
                            : "bg-slate-50 border-border/60"
                        }`}
                      >
                        <span>🟢 طريق سالك</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRoadCondition("congested")}
                        className={`py-2 px-3 rounded-2xl text-xs font-bold transition-all btn-press border flex items-center justify-center gap-1.5 ${
                          roadCondition === "congested"
                            ? "bg-amber-600 text-white border-amber-700 shadow"
                            : "bg-slate-50 border-border/60"
                        }`}
                      >
                        <span>🟡 ازدحام وذروة (+{ROAD_RATES.congested.extra} د.ع)</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Vehicle Selection Cards with Realistic Fares */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground">اختر فئة السيارة</div>
                <div className="space-y-2">
                  {VEHICLE_CATS.map((c) => {
                    const active = vehicleCategory === c.key;
                    const fare =
                      routeKm !== null
                        ? taxiFare(c.key, routeKm, {
                            weather: weatherCondition,
                            roadCondition,
                          })
                        : FARE_TABLE[c.key].minimum;

                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setVehicleCategory(c.key)}
                        className={`w-full text-right p-3 rounded-2xl btn-press transition-all flex items-center gap-3 border ${
                          active
                            ? "bg-white ring-2 ring-primary border-primary shadow-lg scale-[1.01]"
                            : "bg-slate-50/80 border-border/60 hover:bg-white"
                        }`}
                      >
                        <div
                          className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${c.gradient} grid place-items-center text-2xl shadow-md shrink-0`}
                        >
                          {c.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm text-foreground">{c.label}</div>
                          <div className="text-[11px] text-muted-foreground">{c.desc} · وصول {c.eta}</div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="font-black text-base text-primary">
                            {fare.toLocaleString()} د.ع
                          </div>
                          <div className="text-[10px] text-muted-foreground">تسعيرة واقعية دقيقة</div>
                        </div>
                        {active && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transparent Price Breakdown Toggle (Proving real pricing) */}
              <div className="bg-slate-50 border border-border/60 rounded-2xl p-2.5">
                <button
                  type="button"
                  onClick={() => setShowFareDetails((d) => !d)}
                  className="w-full flex items-center justify-between text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <span>📊 تفاصيل الحسبة الحقيقية (شفافية 100%)</span>
                  </span>
                  <span>{showFareDetails ? "إخفاء التفاصيل ▲" : "عرض الحسبة بالدينار ▼"}</span>
                </button>

                {showFareDetails && (
                  <div className="mt-2.5 pt-2 border-t border-border/60 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>فتحة العداد (الأساسية):</span>
                      <span className="font-bold text-foreground">{currentBreakdown.baseFare.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>أجرة المسافة ({currentBreakdown.distanceKm} كم × {FARE_TABLE[vehicleCategory].perKm} د.ع):</span>
                      <span className="font-bold text-foreground">+{currentBreakdown.distanceFare.toLocaleString()} د.ع</span>
                    </div>
                    {currentBreakdown.weatherAllowance > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>بدل الطقس ({WEATHER_RATES[weatherCondition].label}):</span>
                        <span className="font-bold text-foreground">+{currentBreakdown.weatherAllowance.toLocaleString()} د.ع</span>
                      </div>
                    )}
                    {currentBreakdown.trafficAllowance > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>بدل حركة السير ({ROAD_RATES[roadCondition].label}):</span>
                        <span className="font-bold text-foreground">+{currentBreakdown.trafficAllowance.toLocaleString()} د.ع</span>
                      </div>
                    )}
                    <div className="pt-1.5 border-t border-border/40 flex items-center justify-between font-black text-primary">
                      <span>الإجمالي النهائي (مقرب لأقرب 250 د.ع):</span>
                      <span>{currentBreakdown.total.toLocaleString()} د.ع</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes to driver */}
              <div>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظة للسائق (اختياري: قرب مدخل المجمع، سيارة واضحة...)"
                  className="w-full bg-slate-50 border border-border/80 rounded-2xl px-4 py-2.5 text-xs font-medium outline-none focus:border-primary"
                />
              </div>

              {/* Dispatch Action Button */}
              <button
                type="button"
                disabled={busy || !pickupCoords || !destCoords}
                onClick={submit}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-black text-base shadow-xl glow-primary btn-press disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <span>طلب الكابتن الآن</span>
                    <span className="opacity-90 font-bold">· {activeFare.toLocaleString()} د.ع</span>
                    <ArrowLeft className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* =========================================================================
     2. HOME SERVICE VIEW: CLASSIC CLEAN SERVICE FORM
     ========================================================================= */
  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <div className="min-h-screen px-5 pt-10 pb-36">
      <button
        onClick={() => (window.history.length > 1 ? history.back() : navigate({ to: "/home" }))}
        className="text-sm text-muted-foreground mb-4 flex items-center gap-1"
      >
        رجوع
      </button>
      <h1 className="text-3xl font-black">🛠️ طلب خدمة منزلية</h1>
      <p className="text-sm text-muted-foreground mt-1">اختر الحرفة وحدد موقع العمل بسهولة</p>

      {/* Services Grid */}
      <div className="mt-6 mb-3 text-sm font-bold text-muted-foreground">اختر الخدمة</div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {services.map((s) => {
          const v = SERVICE_VISUALS[s.slug] ?? DEFAULT_VISUAL;
          const active = serviceId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setServiceId(s.id)}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl btn-press tap-highlight-none transition-all ${
                active
                  ? "bg-white ring-2 ring-primary shadow-lg scale-105"
                  : "bg-white/70 hover:bg-white"
              }`}
            >
              {active && (
                <CheckCircle2 className="absolute top-1.5 left-1.5 h-4 w-4 text-primary fill-white" />
              )}
              <div
                className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${v.gradient} flex items-center justify-center text-2xl shadow-md`}
              >
                {v.emoji}
              </div>
              <div className="text-[11px] font-bold text-center leading-tight min-h-[28px]">
                {s.name_ar}
              </div>
            </button>
          );
        })}
      </div>

      {selectedService && (
        <div className="glass rounded-2xl p-3 mb-5 flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-xl bg-gradient-to-br ${
              (SERVICE_VISUALS[selectedService.slug] ?? DEFAULT_VISUAL).gradient
            } flex items-center justify-center text-xl`}
          >
            {(SERVICE_VISUALS[selectedService.slug] ?? DEFAULT_VISUAL).emoji}
          </div>
          <div className="text-sm font-bold">{selectedService.name_ar}</div>
        </div>
      )}

      {/* Level Selection */}
      <div className="mb-2 text-sm font-bold text-muted-foreground">المستوى المطلوب</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {(
          [
            { k: "fani", label: "فني", emoji: "🔧", desc: "خبرة جيدة" },
            { k: "khabir", label: "خبير", emoji: "⭐", desc: "خبرة عالية" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.k}
            onClick={() => setLevel(opt.k)}
            className={`p-4 rounded-2xl btn-press text-center transition-all ${
              level === opt.k
                ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg scale-105"
                : "bg-white/70"
            }`}
          >
            <div className="text-2xl mb-1">{opt.emoji}</div>
            <div className="font-black text-sm">{opt.label}</div>
            <div
              className={`text-[10px] mt-0.5 ${level === opt.k ? "opacity-90" : "text-muted-foreground"}`}
            >
              {opt.desc}
            </div>
          </button>
        ))}
      </div>

      {level === "khabir" ? (
        <>
          <div className="mb-2 text-sm font-bold text-muted-foreground">الخبير يحتاج عمال؟</div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              onClick={() => setKhabirMode("alone")}
              className={`p-4 rounded-2xl btn-press transition-all ${
                khabirMode === "alone"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg scale-105"
                  : "bg-white/70"
              }`}
            >
              <User className="h-6 w-6 mx-auto mb-1" />
              <div className="font-black text-sm">خبير فقط</div>
              <div className="text-[10px] mt-0.5 opacity-90">بدون عمال</div>
            </button>
            <button
              onClick={() => setKhabirMode("with_workers")}
              className={`p-4 rounded-2xl btn-press transition-all ${
                khabirMode === "with_workers"
                  ? "bg-gradient-to-br from-fuchsia-400 to-purple-500 text-white shadow-lg scale-105"
                  : "bg-white/70"
              }`}
            >
              <Users className="h-6 w-6 mx-auto mb-1" />
              <div className="font-black text-sm">خبير + عمال</div>
              <div className="text-[10px] mt-0.5 opacity-90">طاقم متكامل</div>
            </button>
          </div>
          {khabirMode === "with_workers" && (
            <>
              <div className="mb-2 text-sm font-bold text-muted-foreground">عدد العمال المساعدين</div>
              <div className="flex items-center gap-3 mb-5 glass rounded-2xl p-3">
                <button
                  onClick={() => setWorkersCount(Math.max(1, workersCount - 1))}
                  className="h-10 w-10 rounded-xl bg-surface-2 font-black btn-press"
                >
                  −
                </button>
                <div className="flex-1 text-center font-black text-2xl">{workersCount}</div>
                <button
                  onClick={() => setWorkersCount(Math.min(10, workersCount + 1))}
                  className="h-10 w-10 rounded-xl bg-primary text-primary-foreground font-black btn-press"
                >
                  +
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 text-sm font-bold text-muted-foreground">عدد العمال المطلوب</div>
          <div className="flex items-center gap-3 mb-5 glass rounded-2xl p-3">
            <button
              onClick={() => setWorkersCount(Math.max(1, workersCount - 1))}
              className="h-10 w-10 rounded-xl bg-surface-2 font-black btn-press"
            >
              −
            </button>
            <div className="flex-1 text-center font-black text-2xl">{workersCount}</div>
            <button
              onClick={() => setWorkersCount(Math.min(10, workersCount + 1))}
              className="h-10 w-10 rounded-xl bg-primary text-primary-foreground font-black btn-press"
            >
              +
            </button>
          </div>
        </>
      )}

      {/* Map location for service */}
      <div className="mt-4 mb-2 text-sm font-bold text-muted-foreground">📍 موقع تقديم الخدمة</div>
      <MapPicker
        value={pickupCoords}
        accent="#0284c7"
        nearby={nearby}
        nearbyKind="worker"
        autoLocateOnMount
        placeholder="ابحث عن عنوان المنزل أو المحل..."
        confirmLabel="تأكيد موقع الخدمة"
        onConfirm={() => toast.success("تم تثبيت موقع الخدمة ✓")}
        onChange={(c, addr) => {
          setPickupCoords(c);
          setPickupLabel(addr ?? `موقعي (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`);
        }}
      />

      {/* Pricing and description */}
      <div className="mt-6 glass rounded-2xl p-4 space-y-3">
        <div className="text-sm font-black">💰 السعر والشغل</div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { k: "fixed", label: "إنجاز تام" },
              { k: "hourly", label: "بالساعات" },
              { k: "negotiable", label: "يحدده الفني" },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setPricingMode(o.k)}
              className={`py-3 rounded-xl text-xs font-bold btn-press ${
                pricingMode === o.k ? "bg-primary text-primary-foreground shadow" : "bg-surface-2"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <textarea
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
          rows={2}
          placeholder="شنو الشغل؟ مثلاً: تصليح سبلت، أو تركيب مضخة ماء"
          className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring resize-none"
        />
        {pricingMode === "hourly" && (
          <input
            inputMode="numeric"
            value={workHours}
            onChange={(e) => setWorkHours(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="عدد الساعات المتوقعة"
            className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring"
          />
        )}
        {pricingMode !== "negotiable" && (
          <>
            <input
              inputMode="numeric"
              value={customerPrice}
              onChange={(e) => setCustomerPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={
                pricingMode === "hourly"
                  ? "المبلغ الكلي (د.ع) مثلاً 25000"
                  : "مبلغ الإنجاز التام (د.ع) مثلاً 50000"
              }
              className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring"
            />
            <div className="flex flex-wrap gap-2">
              {[10000, 25000, 50000, 100000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCustomerPrice(String(v))}
                  className="px-3 py-1.5 rounded-full bg-surface-2 text-xs font-bold btn-press"
                >
                  {v.toLocaleString()} د.ع
                </button>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground">
              المبلغ يكون من مضاعفات 250 دينار.
            </div>
          </>
        )}
      </div>

      <div className="mt-5">
        <div className="text-xs font-bold text-muted-foreground mb-2">📝 ملاحظات إضافية (اختياري)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="تفاصيل إضافية للتواصل..."
          className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring resize-none"
        />
      </div>

      {/* Floating Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 p-4 glass-strong border-t border-border z-30">
        <button
          disabled={busy}
          onClick={submit}
          className="w-full max-w-md mx-auto py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          إرسال الطلب
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
