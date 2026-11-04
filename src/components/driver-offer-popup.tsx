import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { respondToOffer } from "@/lib/dispatch.functions";
import { MapPin, Check, X, Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";

type Offer = {
  id: string;
  request_id: string;
  distance_km: number | null;
  expires_at: string;
  status: string;
};

export function DriverOfferPopup() {
  const { session, roles } = useAuth();
  const navigate = useNavigate();
  const respond = useServerFn(respondToOffer);
  const offerRef = useRef<Offer | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [request, setRequest] = useState<any>(null);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const [totalSeconds, setTotalSeconds] = useState(45);
  const [busy, setBusy] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uid = session?.user.id;
  const isDriver = roles.includes("driver");

  useEffect(() => { offerRef.current = offer; }, [offer]);

  useEffect(() => {
    if (!uid || !isDriver) return;
    const ch = supabase
      .channel(`offers-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "request_offers",
          filter: `provider_id=eq.${uid}`,
        },
        async (payload: any) => {
          const o = payload.new as Offer;
          if (o.status !== "pending") return;
          if (offerRef.current) return;
          const { data: r, error } = await supabase
            .from("service_requests")
            .select("*")
            .eq("id", o.request_id)
            .maybeSingle();
          if (error || !r) return;
          setRequest(r);
          setOffer(o);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, isDriver]);

  useEffect(() => {
    if (!offer) return;
    const expiresAt = new Date(offer.expires_at).getTime();
    const shownUntil = Math.min(expiresAt, Date.now() + 45_000);
    const total = Math.max(1, Math.round((shownUntil - Date.now()) / 1000));
    setTotalSeconds(total);
    const tick = () => {
      const left = Math.max(0, Math.round((shownUntil - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        // Hide the popup but keep the offer open — the driver can still accept it later.
        toast("الطلب بعده متاح بقائمة طلباتك");
        setOffer(null);
        setRequest(null);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [offer]);

  useEffect(() => {
    if (!offer) return;
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {}

    const beep = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.36);
      if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
    };
    beep();
    beepIntervalRef.current = setInterval(beep, 900);
    return () => {
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    };
  }, [offer]);

  async function doRespond(action: "accept" | "reject") {
    if (!offer) return;
    setBusy(true);
    try {
      const res: any = await respond({ data: { offerId: offer.id, action } });
      if (action === "accept" && res?.accepted) {
        toast.success("تم قبول الطلب");
        navigate({ to: "/request/$id", params: { id: res.requestId } });
      } else if (action === "reject") {
        toast("تم تجاهل الطلب");
      }
      setOffer(null);
      setRequest(null);
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر تنفيذ العملية");
      setOffer(null);
      setRequest(null);
    } finally {
      setBusy(false);
    }
  }

  if (!offer || !request) return null;

  const pct = (secondsLeft / totalSeconds) * 100;
  const urgent = secondsLeft <= Math.max(5, Math.round(totalSeconds * 0.2));

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md grid place-items-center p-4 animate-in fade-in duration-200"
    >
      <div
        className={`w-full max-w-md bg-gradient-to-b from-background to-background/95 rounded-3xl p-6 shadow-2xl border-2 ${
          urgent ? "border-rose-500 animate-pulse" : "border-primary"
        } animate-in zoom-in-95 slide-in-from-bottom-6 duration-300`}
        style={{
          boxShadow: urgent
            ? "0 0 60px rgba(244,63,94,0.6), 0 0 30px rgba(244,63,94,0.4)"
            : "0 0 60px rgba(59,130,246,0.4), 0 0 30px rgba(59,130,246,0.25)",
        }}
      >
        <div className="flex flex-col items-center mb-5">
          <div className="text-xs font-bold text-muted-foreground tracking-widest mb-3">
            🚕 طلب رحلة جديد
          </div>
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted/30" />
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 45}`} strokeDashoffset={`${2 * Math.PI * 45 * (1 - pct / 100)}`} className={urgent ? "text-rose-500" : "text-primary"} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className={`text-3xl font-black ${urgent ? "text-rose-500" : "text-primary"}`}>
                {secondsLeft}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <div className="flex items-start gap-3 bg-emerald-500/10 rounded-2xl p-3">
            <MapPin className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">نقطة الانطلاق</div>
              <div className="font-bold truncate">{request.pickup_text ?? "—"}</div>
            </div>
          </div>
          {request.dest_text && (
            <div className="flex items-start gap-3 bg-rose-500/10 rounded-2xl p-3">
              <Navigation className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">الوجهة</div>
                <div className="font-bold truncate">{request.dest_text}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-2xl px-3 py-2.5 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">المسافة منك</div>
              <div className="font-black text-sm mt-0.5">{offer.distance_km ? `${Number(offer.distance_km).toFixed(1)} كم` : "—"}</div>
            </div>
            {request.price_estimate && (
              <div className="bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl px-3 py-2.5 text-center border border-primary/30">
                <div className="text-[10px] uppercase text-primary/80">السعر</div>
                <div className="font-black text-primary text-sm mt-0.5">{Number(request.price_estimate).toLocaleString()} د.ع</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => doRespond("reject")} disabled={busy} className="py-4 rounded-2xl border-2 border-border bg-card font-black text-base active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60">
            <X className="h-5 w-5" /> رفض
          </button>
          <button onClick={() => doRespond("accept")} disabled={busy} className="py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-black text-base active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-emerald-500/40">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            قبول
          </button>
        </div>
      </div>
    </div>
  );
}
