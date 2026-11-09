import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Car, Wrench, ArrowLeft, Loader2, Sparkles, X } from "lucide-react";
import { playClick } from "@/lib/click-sound";

interface ActiveRequest {
  id: string;
  type: "taxi" | "service";
  status: "pending" | "searching" | "accepted" | "in_progress";
  pickup_text: string | null;
  dest_text: string | null;
  price_estimate: number | null;
  customer_price: number | null;
  created_at: string;
}

export function ActiveRequestBanner() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const [activeReq, setActiveReq] = useState<ActiveRequest | null>(null);
  const [minimized, setMinimized] = useState(false);
  const uid = session?.user?.id;

  useEffect(() => {
    if (!uid) {
      setActiveReq(null);
      return;
    }

    let isMounted = true;

    async function checkActiveRequest() {
      try {
        const { data } = await supabase
          .from("service_requests")
          .select(
            "id, type, status, pickup_text, dest_text, price_estimate, customer_price, created_at",
          )
          .eq("customer_id", uid)
          .in("status", ["pending", "searching", "accepted", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isMounted) {
          setActiveReq((data as ActiveRequest) || null);
        }
      } catch {
        // Safe catch
      }
    }

    checkActiveRequest();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`active-customer-req-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `customer_id=eq.${uid}`,
        },
        () => {
          checkActiveRequest();
        },
      )
      .subscribe();

    // Polling interval fallback for instant responsiveness
    const timer = setInterval(checkActiveRequest, 3000);

    return () => {
      isMounted = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  // Hide if no active request or if user is already on the request's page
  if (!activeReq) return null;
  if (currentPath === `/request/${activeReq.id}`) return null;
  if (minimized) {
    return (
      <div
        dir="rtl"
        className="fixed top-3 right-3 z-[9990] animate-in fade-in zoom-in duration-200"
      >
        <button
          onClick={() => {
            playClick("pop");
            setMinimized(false);
          }}
          className="glass-strong border border-primary/50 shadow-elegant glow-primary px-3 py-2 rounded-full flex items-center gap-2 text-xs font-black text-primary btn-press tap-highlight-none"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
          </span>
          {activeReq.type === "taxi" ? "🚕 رحلة جارية" : "🛠️ طلب خدمة"}
        </button>
      </div>
    );
  }

  const isTaxi = activeReq.type === "taxi";
  const isSearching = activeReq.status === "pending" || activeReq.status === "searching";
  const isAccepted = activeReq.status === "accepted";
  const isInProgress = activeReq.status === "in_progress";

  const statusText = isSearching
    ? "جاري البحث عن كابتن..."
    : isAccepted
      ? "تم قبول الطلب! الكابتن في الطريق"
      : "الرحلة قيد التنفيذ الآن";

  const destinationText = activeReq.dest_text || activeReq.pickup_text || "تفاصيل الموقع محددة";

  return (
    <aside
      dir="rtl"
      aria-label="الطلب النشط"
      className="fixed top-3 inset-x-3 sm:max-w-md sm:mx-auto z-[9990] animate-in slide-in-from-top-4 fade-in duration-300"
    >
      <div
        onClick={() => {
          playClick("pop");
          navigate({ to: "/request/$id", params: { id: activeReq.id } });
        }}
        className="relative overflow-hidden glass-strong border-2 border-primary/60 rounded-3xl p-3.5 shadow-elegant glow-primary cursor-pointer hover:border-primary transition group"
      >
        {/* Subtle animated background gradient */}
        <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-primary/20 blur-xl pointer-events-none group-hover:scale-125 transition-transform" />

        <div className="relative flex items-center gap-3">
          {/* Animated icon badge */}
          <div
            className={`h-11 w-11 rounded-2xl grid place-items-center text-white shadow-md shrink-0 relative ${
              isTaxi
                ? "bg-gradient-to-br from-amber-500 to-yellow-400"
                : "bg-gradient-to-br from-emerald-500 to-teal-400"
            }`}
          >
            {isTaxi ? <Car className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
            {isSearching && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}
            {(isAccepted || isInProgress) && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-background"></span>
              </span>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-foreground">{statusText}</span>
              {isSearching && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {destinationText}
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-sm group-hover:bg-primary-glow transition">
              <span>متابعة</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </div>

            {/* Minimize toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playClick("soft");
                setMinimized(true);
              }}
              title="تصغير الإشعار"
              aria-label="تصغير الإشعار"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-2 grid place-items-center transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
