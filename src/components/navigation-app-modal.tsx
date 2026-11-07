import { useEffect, useState } from "react";
import { X, Navigation, ExternalLink, MapPin, Check, Copy } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";

export interface NavigationTarget {
  lat: number;
  lng: number;
  label: string;
}

export interface NavigationAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  pickup?: NavigationTarget | null;
  destination?: NavigationTarget | null;
  defaultTarget?: "pickup" | "dest";
}

export function NavigationAppModal({
  isOpen,
  onClose,
  pickup,
  destination,
  defaultTarget = "pickup",
}: NavigationAppModalProps) {
  const [targetType, setTargetType] = useState<"pickup" | "dest">(
    defaultTarget === "dest" && destination ? "dest" : pickup ? "pickup" : "dest"
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setTargetType(defaultTarget === "dest" && destination ? "dest" : pickup ? "pickup" : "dest");
  }, [isOpen, defaultTarget, !!pickup, !!destination]);

  if (!isOpen) return null;

  const current = targetType === "pickup" ? pickup : destination;
  const coords = current ? { lat: current.lat, lng: current.lng } : null;
  const label = current?.label || (targetType === "pickup" ? "موقع الانطلاق" : "وجهة الوصول");

  function openApp(app: "google" | "waze" | "native") {
    if (!coords) {
      toast.error("إحداثيات الموقع غير متوفرة");
      return;
    }

    const { lat, lng } = coords;

    switch (app) {
      case "google": {
        const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        window.open(googleUrl, "_blank");
        toast.success("جاري فتح خرائط Google 🗺️");
        break;
      }

      case "waze": {
        const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        window.open(wazeUrl, "_blank");
        toast.success("جاري فتح تطبيق Waze 🚗");
        break;
      }

      case "native": {
        const nativeUrl = `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
        window.open(nativeUrl, "_blank");
        toast.success("جاري فتح تطبيق الخرائط الافتراضي 🧭");
        break;
      }
    }

    onClose();
  }

  function copyCoordinates() {
    if (!coords) return;
    const text = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("تم نسخ الإحداثيات!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl border border-border/60 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-5 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black">ملاحة</h2>
              <p className="text-[11px] text-muted-foreground">للوصول السريع إلى العميل أو الوجهة</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 grid place-items-center text-muted-foreground btn-press"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Target Switcher: Pickup vs Destination (if both provided) */}
        {pickup && destination && (
          <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <Button
              type="button"
              onClick={() => setTargetType("pickup")}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all btn-press flex items-center justify-center gap-1.5 ${
                targetType === "pickup"
                  ? "bg-white text-sky-600 shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>موقع العميل (الانطلاق)</span>
            </Button>
            <Button
              type="button"
              onClick={() => setTargetType("dest")}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all btn-press flex items-center justify-center gap-1.5 ${
                targetType === "dest"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>وجهة الوصول</span>
            </Button>
          </div>
        )}

        {/* Target summary chip */}
        <div className="mt-3 p-3 rounded-2xl bg-slate-50 border border-border/60 flex items-center justify-between text-xs">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-muted-foreground">الهدف المحدد:</div>
            <div className="font-bold text-foreground truncate">{label}</div>
          </div>
          {coords && (
            <Button
              type="button"
              onClick={copyCoordinates}
              className="text-[11px] font-bold text-primary flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-xl border border-border/40 shadow-sm hover:bg-slate-50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "تم النسخ" : "نسخ الموقع"}</span>
            </Button>
          )}
        </div>

        {/* Navigation Apps Grid */}
        <div className="mt-4 space-y-2.5">
          {/* 2. Google Maps */}
          <Button
            type="button"
            onClick={() => openApp("google")}
            className="w-full p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-border/70 shadow-sm flex items-center gap-3 text-right btn-press transition-all group"
          >
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 text-white font-black text-xl grid place-items-center shadow-md shrink-0">
              🗺️
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm text-foreground">خرائط Google (Google Maps)</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                التطبيق الأكثر استخداماً مع توجيه صوتي ومسارات بديلة
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100" />
          </Button>

          {/* 3. Waze */}
          <Button
            type="button"
            onClick={() => openApp("waze")}
            className="w-full p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-border/70 shadow-sm flex items-center gap-3 text-right btn-press transition-all group"
          >
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-black text-xl grid place-items-center shadow-md shrink-0">
              🚗
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm text-foreground">تطبيق Waze (ويز)</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                تنبيهات الازدحام اللحظية، الرادارات، والحوادث المرورية
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100" />
          </Button>

          {/* 4. Native / Device Maps */}
          <Button
            type="button"
            onClick={() => openApp("native")}
            className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-border/60 flex items-center gap-3 text-right btn-press transition-all"
          >
            <div className="h-10 w-10 rounded-xl bg-slate-200 text-foreground grid place-items-center text-lg shrink-0">
              🧭
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xs text-foreground">تطبيق الخرائط الافتراضي للجهاز</div>
              <div className="text-[10px] text-muted-foreground">فتح عبر التطبيق الافتراضي لهاتفك</div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
