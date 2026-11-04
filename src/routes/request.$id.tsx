import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Send, Loader2, CheckCircle2, Clock, Star, X, Navigation } from "lucide-react";
import { toast } from "sonner";
import { LiveTrackMap } from "@/components/live-track-map";
import { useLiveTracking } from "@/lib/use-live-tracking";
import { CancelReasonModal } from "@/components/cancel-reason-modal";
import { QuickReplies } from "@/components/quick-replies";
import { cancelRequest, providerCancelRequest, retryDispatch, startRide, completeRide } from "@/lib/dispatch.functions";
import { getReputation, type ReputationData } from "@/lib/reputation.functions";
import { ReputationBadge } from "@/components/reputation";
import { playMessageSound } from "@/lib/click-sound";
import { NavigationAppModal } from "@/components/navigation-app-modal";


const VEHICLE_CAT_META: Record<string, { label: string; emoji: string; gradient: string }> = {
  economy: { label: "ممنون اقتصادي", emoji: "🚗", gradient: "from-emerald-400 to-teal-500" },
  premium: { label: "ممنون المتميز", emoji: "🚙", gradient: "from-sky-500 to-indigo-600" },
  luxury:  { label: "ممنون فاخر",   emoji: "🏎️", gradient: "from-amber-400 to-orange-500" },
};

export const Route = createFileRoute("/request/$id")({ ssr: false,
  head: () => ({ meta: [
    { title: "تفاصيل الطلب | ممنون" },
    { name: "description", content: "تابع حالة طلبك وموقع مزود الخدمة وتواصل معه في ممنون." },
    { property: "og:title", content: "تفاصيل الطلب | ممنون" },
    { property: "og:description", content: "تابع حالة طلبك وموقع مزود الخدمة وتواصل معه في ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: RequestDetail });

function RequestDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [req, setReq] = useState<any>(null);
  const [other, setOther] = useState<any>(null);
  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState<any>(null);
  const [showRating, setShowRating] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [navModalOpen, setNavModalOpen] = useState(false);
  const [otherRep, setOtherRep] = useState<ReputationData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const getRepFn = useServerFn(getReputation);
  const cancelFn = useServerFn(cancelRequest);
  const providerCancelFn = useServerFn(providerCancelRequest);
  const retryFn = useServerFn(retryDispatch);
  const runStartRide = useServerFn(startRide);
  const runCompleteRide = useServerFn(completeRide);

  const myUserId = session?.user.id ?? null;
  const otherUserId = req ? (myUserId === req.customer_id ? req.provider_id : req.customer_id) : null;
  const myRole: "customer" | "provider" = req && myUserId === req.customer_id ? "customer" : "provider";
  const trackingActive = !!req && (req.status === "accepted" || req.status === "in_progress");
  const { me: myLive, other: otherLive } = useLiveTracking({
    requestId: req?.id ?? null,
    myUserId,
    otherUserId,
    myRole,
    active: trackingActive,
  });


  async function loadAll() {
    try {
      const { data: r } = await supabase.from("service_requests").select("*").eq("id", id).maybeSingle();
      if (!r) { setLoading(false); return; }
      setReq(r);
      const otherId = session?.user.id === r.customer_id ? r.provider_id : r.customer_id;
      if (otherId) {
        const { data: p } = await supabase.from("profiles").select("id, full_name, phone, avatar_url").eq("id", otherId).maybeSingle();
        setOther(p);
        getRepFn({ data: { userId: otherId } }).then((rep) => setOtherRep(rep)).catch(() => {});
      }
      if (r.status !== "pending") {
        const { data: c } = await supabase.from("chats").select("*").eq("request_id", id).maybeSingle();
        setChat(c);
        if (c) {
          const { data: m } = await supabase.from("messages").select("*").eq("chat_id", c.id).order("created_at");
          setMessages(m ?? []);
        }
      }
      if (session?.user) {
        const { data: rate } = await supabase.from("ratings").select("*").eq("request_id", id).eq("rater_id", session.user.id).maybeSingle();
        setMyRating(rate);
        if (r.status === "completed" && !rate) setShowRating(true);
      }
    } catch (e) {
      console.error("[request] loadAll error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (session) loadAll(); }, [session, id]);


  useEffect(() => {
    if (!chat) return;
    const ch = supabase.channel(`messages-${chat.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` },
        (payload) => {
          setMessages((m) => [...m, payload.new]);
          const isIncoming = payload.new.sender_id !== session?.user?.id;
          playMessageSound(isIncoming);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chat, session?.user?.id]);

  useEffect(() => {
    if (!req) return;
    const ch = supabase.channel(`req-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests", filter: `id=eq.${id}` },
        () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [req?.id]);

  useEffect(() => {
    if (!req || myRole !== "customer") return;
    if (!["pending", "searching"].includes(req.status as string)) return;
    const t = setInterval(() => {
      retryFn({ data: { requestId: req.id } }).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, [req?.id, req?.status, myRole]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (authLoading || loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!session) return <Navigate to="/auth" />;
  if (!req) return <div className="p-8 text-center">الطلب غير موجود</div>;

  async function send() {
    if (!draft.trim() || !chat) return;
    const text = draft.trim();
    setDraft("");
    playMessageSound(false);
    const { error } = await supabase.from("messages").insert({
      chat_id: chat.id, sender_id: session!.user.id, content: text,
    });
    if (error) toast.error(error.message);
  }

  async function markCompleted() {
    try {
      await runCompleteRide({ data: { requestId: id } });
      toast.success("تم إنهاء الطلب");
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر إنهاء الطلب");
    }
  }

  const statusLabel = {
    pending: "بانتظار القبول",
    searching: "جاري البحث",
    accepted: "تم القبول",
    in_progress: "قيد التنفيذ",
    completed: "مكتمل",
    cancelled: "ملغي",
  }[req.status as string] ?? req.status;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="glass-strong px-5 pt-10 pb-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-black">{req.type === "taxi" ? "رحلة تكسي" : "خدمة فنية"}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              {req.status === "pending" ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              {statusLabel}
            </div>
          </div>
          {other && (
            <a href={`tel:${other.phone}`} className="glass h-11 w-11 rounded-2xl grid place-items-center btn-press">
              <Phone className="h-5 w-5 text-primary" />
            </a>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {req.type === "taxi" && req.vehicle_category && VEHICLE_CAT_META[req.vehicle_category] && (
          <div className={`rounded-2xl p-3 text-white bg-gradient-to-br ${VEHICLE_CAT_META[req.vehicle_category].gradient} shadow-md flex items-center gap-3`}>
            <div className="text-2xl">{VEHICLE_CAT_META[req.vehicle_category].emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] opacity-90">فئة السيارة</div>
              <div className="font-black text-sm">{VEHICLE_CAT_META[req.vehicle_category].label}</div>
            </div>
            {req.price_estimate && (
              <div className="text-left">
                <div className="font-black text-sm">{Number(req.price_estimate).toLocaleString()}</div>
                <div className="text-[10px] opacity-80">د.ع تقريبي</div>
              </div>
            )}
          </div>
        )}

        {req.type === "service" && ((req as any).pricing_mode || (req as any).work_description) && (
          <div className="glass rounded-2xl p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground">السعر والشغل</div>
            {(req as any).work_description && <div className="text-sm font-bold">🛠️ {(req as any).work_description}</div>}
            <div className="font-black text-primary">
              {(req as any).pricing_mode === "negotiable"
                ? "💰 السعر يتفق عليه الطرفين"
                : `💰 ${Number((req as any).customer_price ?? 0).toLocaleString()} د.ع${(req as any).pricing_mode === "hourly" && (req as any).work_hours ? ` · ${(req as any).work_hours} ساعة` : " · إنجاز تام"}`}
            </div>
          </div>
        )}

        {trackingActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
              <div className="flex items-center gap-2">
                <Navigation className="h-3.5 w-3.5 text-primary animate-pulse" />
                <span>تتبع الكابتن المباشر نحو نقطة الانطلاق</span>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                مباشر GPS
              </span>
            </div>
            <LiveTrackMap
              me={myLive ?? (req && req.pickup_lat != null && req.pickup_lng != null ? { lat: Number(req.pickup_lat), lng: Number(req.pickup_lng) } : null)}
              other={otherLive}
              pickupCoords={req.pickup_lat != null && req.pickup_lng != null ? { lat: Number(req.pickup_lat), lng: Number(req.pickup_lng) } : null}
              destCoords={req.dest_lat != null && req.dest_lng != null ? { lat: Number(req.dest_lat), lng: Number(req.dest_lng) } : null}
              status={req.status}
              myRole={myRole}
              serviceType={req.type}
              driverName={other?.full_name ?? "الكابتن"}
              driverPhone={other?.phone}
              vehicleCategory={req.vehicle_category}
              height={280}
              onOpenNavigation={() => setNavModalOpen(true)}
            />
          </div>
        )}

        {/* External Navigation Button (Darbouna 🇮🇶 / Google Maps / Waze) */}
        {(req.pickup_lat != null || req.dest_lat != null) && (
          <button
            type="button"
            onClick={() => setNavModalOpen(true)}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 text-white font-black text-xs shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2 btn-press"
          >
            <Navigation className="h-4 w-4" />
            <span>الملاحة عبر دربونة 🇮🇶 أو خرائط Google أو Waze</span>
          </button>
        )}

        <div className="glass rounded-2xl p-4 text-sm space-y-2">
          <div><span className="text-muted-foreground text-xs">📍 الموقع: </span><span className="font-bold">{req.pickup_text}</span></div>
          {req.dest_text && <div><span className="text-muted-foreground text-xs">🎯 الوجهة: </span><span className="font-bold">{req.dest_text}</span></div>}
          {req.notes && <div><span className="text-muted-foreground text-xs">📝 ملاحظة: </span><span>{req.notes}</span></div>}
        </div>


        {other && req.status !== "pending" && (
          <div className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground font-black">
              {(other.full_name || "?").charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{other.full_name || "مستخدم"}</div>
              <div className="text-xs text-muted-foreground" dir="ltr">{other.phone}</div>
              {otherRep && otherRep.badges && otherRep.badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {otherRep.badges.map((b) => (
                    <ReputationBadge key={b.code} badge={b} size="sm" />
                  ))}
                </div>
              )}
            </div>
            {req.status === "accepted" && session.user.id === req.provider_id && (
              <button onClick={async () => {
                try {
                  await runStartRide({ data: { requestId: id } });
                  toast.success("بدأت الرحلة");
                } catch (e: any) {
                  toast.error(e.message ?? "تعذّر بدء الرحلة");
                }
              }} className="text-xs px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold btn-press">بدء الرحلة</button>
            )}
            {req.status === "in_progress" && session.user.id === req.provider_id && (
              <button onClick={markCompleted} className="text-xs px-3 py-2 rounded-xl bg-success text-success-foreground font-bold btn-press">إنهاء الرحلة</button>
            )}
            {["pending", "searching", "accepted", "in_progress"].includes(req.status as string) && (
              <button
                onClick={() => setShowCancel(true)}
                className="text-xs px-3 py-2 rounded-xl bg-destructive/10 text-destructive font-bold btn-press"
              >
                إلغاء
              </button>
            )}
          </div>
        )}

        {req.status === "completed" && other && (
          myRating ? (
            <div className="glass rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold">تقييمك:</span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`h-4 w-4 ${s <= myRating.stars ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                  ))}
                </div>
              </div>
              {(myRating.professionalism || myRating.punctuality || myRating.quality) && (
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>الاحترافية: {myRating.professionalism ?? "—"}</span>
                  <span>الوقت: {myRating.punctuality ?? "—"}</span>
                  <span>الجودة: {myRating.quality ?? "—"}</span>
                </div>
              )}
              {myRating.comment && <p className="text-muted-foreground text-xs">«{myRating.comment}»</p>}
            </div>
          ) : (
            <button onClick={() => setShowRating(true)} className="w-full glass rounded-2xl p-4 flex items-center justify-center gap-2 btn-press font-bold text-sm text-primary">
              <Star className="h-5 w-5 fill-primary" /> قيّم الخدمة
            </button>
          )
        )}

      </div>

      {chat && (
        <>
          <div className="px-5 pt-3 pb-1 flex items-center justify-between text-xs text-muted-foreground border-b border-border/40">
            <span className="font-bold flex items-center gap-1.5">
              <span>المحادثة المباشرة</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </span>
            <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
              🔊 صوت التنبيه مفعّل
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 scroll-smooth max-h-[420px]">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">
                ابدأ المحادثة 👋 (يتم التنبيه بصوت عند وصول أي رسالة)
              </div>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === session.user.id;
              const timeStr = m.created_at
                ? new Date(m.created_at).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })
                : "";
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-start" : "justify-end"} animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-white text-foreground border border-border/70 rounded-bl-sm"
                    }`}
                  >
                    <div>{m.content}</div>
                    {timeStr && (
                      <div
                        className={`text-[9px] mt-1 text-left ${
                          mine ? "text-primary-foreground/75" : "text-muted-foreground"
                        }`}
                      >
                        {timeStr}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-strong p-3 border-t border-border sticky bottom-0 space-y-2">
            <QuickReplies
              role={myRole}
              type={req.type as "taxi" | "service"}
              onPick={async (text) => {
                if (!chat) return;
                playMessageSound(false);
                const { error } = await supabase.from("messages").insert({
                  chat_id: chat.id, sender_id: session!.user.id, content: text,
                });
                if (error) toast.error(error.message);
              }}
            />
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="اكتب رسالة..."
                className="flex-1 bg-input border border-border rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-ring"
              />
              <button type="submit" className="h-11 w-11 rounded-2xl bg-primary grid place-items-center btn-press glow-primary">
                <Send className="h-5 w-5 text-primary-foreground" />
              </button>
            </form>
          </div>
        </>
      )}

      {["pending", "searching"].includes(req.status as string) && (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          {req.status === "searching"
            ? "نبحث عن أقرب مزوّد لك..."
            : "بانتظار قبول الطلب من أحد المزودين..."}
          {myRole === "customer" && (
            <button
              onClick={() => setShowCancel(true)}
              className="block mx-auto mt-5 px-5 py-2.5 rounded-2xl bg-destructive/10 text-destructive font-bold text-xs btn-press"
            >
              إلغاء الطلب
            </button>
          )}
        </div>
      )}

      {showCancel && (
        <CancelReasonModal
          role={myRole}
          onClose={() => setShowCancel(false)}
          onSubmit={async (reason) => {
            try {
              if (myRole === "customer") {
                await cancelFn({ data: { requestId: id, reason } });
              } else {
                await providerCancelFn({ data: { requestId: id, reason } });
              }
              toast.success("تم الإلغاء");
              setShowCancel(false);
              loadAll();
            } catch (e: any) {
              toast.error(e.message ?? "تعذّر الإلغاء");
            }
          }}
        />
      )}

      {showRating && other && (
        <RatingModal
          target={other}
          onClose={() => setShowRating(false)}
          onSubmit={async (stars, comment, subscores) => {
            const { data, error } = await (supabase as any).from("ratings").insert({
              request_id: id,
              rater_id: session.user.id,
              ratee_id: other.id,
              stars,
              comment: comment || null,
              professionalism: subscores.professionalism,
              punctuality: subscores.punctuality,
              quality: subscores.quality,
            }).select().single();
            if (error) { toast.error(error.message); return; }
            setMyRating(data);
            setShowRating(false);
            toast.success("شكراً على تقييمك ⭐");
          }}
        />
      )}

      <NavigationAppModal
        isOpen={navModalOpen}
        onClose={() => setNavModalOpen(false)}
        pickup={
          req?.pickup_lat != null && req?.pickup_lng != null
            ? { lat: Number(req.pickup_lat), lng: Number(req.pickup_lng), label: req.pickup_text || "موقع العميل" }
            : null
        }
        destination={
          req?.dest_lat != null && req?.dest_lng != null
            ? { lat: Number(req.dest_lat), lng: Number(req.dest_lng), label: req.dest_text || "وجهة الوصول" }
            : null
        }
        defaultTarget={myRole === "provider" && req?.status === "accepted" ? "pickup" : "dest"}
      />
    </div>
  );
}

function RatingModal({ target, onClose, onSubmit }: { target: any; onClose: () => void; onSubmit: (stars: number, comment: string, subscores: { professionalism: number; punctuality: number; quality: number }) => Promise<void> }) {
  const [stars, setStars] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [prof, setProf] = useState(5);
  const [punc, setPunc] = useState(5);
  const [qual, setQual] = useState(5);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 backdrop-blur-sm p-5" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm glass-strong rounded-3xl p-6 shadow-elegant relative animate-in fade-in zoom-in-95">
        <button onClick={onClose} className="absolute top-3 left-3 h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary btn-press">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center mb-4">
          <div className="h-16 w-16 mx-auto rounded-3xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground font-black text-2xl mb-3">
            {(target.full_name || "?").charAt(0)}
          </div>
          <div className="font-black text-lg">كيف كانت تجربتك؟</div>
          <div className="text-xs text-muted-foreground mt-1">قيّم {target.full_name || "المزود"}</div>
        </div>

        <div className="flex justify-center gap-1.5 my-5" onMouseLeave={() => setHover(0)}>
          {[1,2,3,4,5].map((s) => {
            const active = s <= (hover || stars);
            return (
              <button
                key={s}
                type="button"
                onMouseEnter={() => setHover(s)}
                onClick={() => setStars(s)}
                className="btn-press p-1 transition-transform"
                style={{ transform: active ? "scale(1.1)" : "scale(1)" }}
              >
                <Star className={`h-10 w-10 transition ${active ? "text-primary fill-primary drop-shadow-[0_4px_12px_var(--primary)]" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>
        <div className="text-center text-xs text-muted-foreground mb-3">
          {["", "سيء جداً", "سيء", "مقبول", "جيد", "ممتاز"][hover || stars]}
        </div>

        {/* Sub-scores */}
        <div className="space-y-2.5 mb-3">
          <SubScoreInput label="الاحترافية" value={prof} onChange={setProf} />
          <SubScoreInput label="الالتزام بالوقت" value={punc} onChange={setPunc} />
          <SubScoreInput label="جودة العمل" value={qual} onChange={setQual} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="اكتب تعليقك (اختياري)..."
          rows={3}
          className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-ring resize-none"
        />

        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await onSubmit(stars, comment.trim(), { professionalism: prof, punctuality: punc, quality: qual }); setBusy(false); }}
          className="mt-4 w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-black btn-press glow-primary disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "إرسال التقييم"}
        </button>
      </div>
    </div>
  );
}

function SubScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-muted-foreground shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="btn-press p-0.5"
          >
            <Star className={`h-5 w-5 transition ${s <= value ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
