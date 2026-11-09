import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MobileShell } from "@/components/mobile-shell";
import {
  LogOut,
  Star,
  Settings,
  Wallet,
  TrendingUp,
  ShieldCheck,
  ChevronLeft,
  Check,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsBell } from "@/components/notifications-bell";
import { useServerFn } from "@tanstack/react-start";
import { getReputation, getProviderReviews, type ReputationData } from "@/lib/reputation.functions";
import { ReputationCard, StarRating } from "@/components/reputation";
import { toast } from "@/lib/toast";
import { playClick } from "@/lib/click-sound";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الملف الشخصي | ممنون" },
      { name: "description", content: "إدارة معلومات حسابك وتقييماتك في ممنون." },
      { property: "og:title", content: "الملف الشخصي | ممنون" },
      { property: "og:description", content: "إدارة معلومات حسابك وتقييماتك في ممنون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

const ROLE_CONFIG: Record<string, { label: string; desc: string; icon: string }> = {
  customer: {
    label: "زبون",
    desc: "طلب مشاوير تاكسي وخدمات منزلية",
    icon: "👤",
  },
  driver: {
    label: "كابتن تكسي",
    desc: "استقبال طلبات الرحلات اليومية والعمل كسائق",
    icon: "🚗",
  },
  worker: {
    label: "فني خدمات",
    desc: "استقبال طلبات الصيانة والخدمات التخصصية",
    icon: "🛠️",
  },
  admin: {
    label: "إدارة النظام",
    desc: "لوحة التحكم والإشراف العام",
    icon: "⚡",
  },
};

function ProfilePage() {
  const { session, profile, roles, activeRole, setActiveRole, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [showReviews, setShowReviews] = useState(false);
  const uid = session?.user.id;
  const isDriver = roles.includes("driver");
  const isWorker = roles.includes("worker");
  const isProvider = isDriver || isWorker;

  const getRepFn = useServerFn(getReputation);
  const getReviewsFn = useServerFn(getProviderReviews);

  useEffect(() => {
    if (!uid) return;
    if (isDriver) {
      (supabase as any)
        .from("driver_wallets")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle()
        .then(({ data }: any) => setWallet(data));
      (supabase as any)
        .from("transactions")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }: any) => setTxs(data ?? []));
    }
    (supabase as any)
      .rpc("has_admin_access", { p_user_id: uid })
      .then(({ data }: any) => setIsAdmin(!!data));
    if (isProvider && uid) {
      getRepFn({ data: { userId: uid } })
        .then((rep) => setReputation(rep))
        .catch(() => {});
    }
  }, [uid, isDriver, isProvider]);

  async function loadReviews() {
    if (!uid) return;
    try {
      const r = await getReviewsFn({ data: { userId: uid } });
      setReviews(r as any[]);
    } catch {}
  }

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  return (
    <MobileShell>
      <div className="px-5 pt-10 pb-6">
        <div className="flex justify-end mb-3">
          <NotificationsBell />
        </div>
        <div className="glass rounded-3xl p-6 text-center shadow-card">
          {profile?.avatar_url ? (
            <div className="h-20 w-20 mx-auto rounded-3xl overflow-hidden border-2 border-primary shadow-lg mb-3">
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground text-3xl font-black glow-primary mb-3">
              {(profile?.full_name || "؟").charAt(0)}
            </div>
          )}
          <div className="text-xl font-black flex items-center justify-center gap-1.5">
            <span>{profile?.full_name}</span>
            {isProvider && (
              <ShieldCheck className="h-4 w-4 text-emerald-600 inline" aria-label="هوية موثقة" />
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1" dir="ltr">
            {profile?.phone}
          </div>
          <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
            {roles.map((r) => (
              <span
                key={r}
                className="text-[10px] font-black px-3 py-1 rounded-full bg-primary/20 text-primary"
              >
                {r === "customer"
                  ? "زبون"
                  : r === "driver"
                    ? "كابتن موثق 🚗"
                    : (r as string) === "admin"
                      ? "مدير"
                      : "فني موثق 🛠️"}
              </span>
            ))}
          </div>
          {isProvider && reputation && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <StarRating stars={Number(reputation.avg_stars)} size="sm" />
              <span className="text-xs font-bold text-muted-foreground">
                {Number(reputation.avg_stars).toFixed(1)} ({reputation.ratings_count})
              </span>
            </div>
          )}
        </div>
        {isProvider && reputation && (
          <div className="mt-5">
            <ReputationCard reputation={reputation} />
            {reputation.ratings_count > 0 && (
              <button
                onClick={() => {
                  if (!showReviews && reviews.length === 0) loadReviews();
                  setShowReviews(!showReviews);
                }}
                className="w-full mt-3 glass rounded-2xl p-3 flex items-center justify-between btn-press"
              >
                <span className="text-xs font-bold">آراء العملاء</span>
                <ChevronLeft
                  className={`h-4 w-4 text-muted-foreground transition-transform ${showReviews ? "rotate-90" : ""}`}
                />
              </button>
            )}
            {showReviews && reviews.length > 0 && (
              <div className="mt-2 space-y-2">
                {reviews.map((rv) => (
                  <div key={rv.id} className="glass rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/20 grid place-items-center text-xs font-bold text-primary">
                          {(rv.rater?.full_name || "؟").charAt(0)}
                        </div>
                        <span className="text-xs font-bold">{rv.rater?.full_name || "مستخدم"}</span>
                      </div>
                      <StarRating stars={rv.stars} size="sm" />
                    </div>
                    {rv.comment && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        «{rv.comment}»
                      </p>
                    )}
                    <div className="text-[10px] text-muted-foreground/60 mt-1">
                      {new Date(rv.created_at).toLocaleDateString("ar-IQ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {isDriver && (
          <div className="mt-5 rounded-3xl p-5 bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant glow-primary">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-bold">محفظتي</span>
            </div>
            <div className="text-3xl font-black">
              {Number(wallet?.balance ?? 0).toLocaleString()}{" "}
              <span className="text-base font-bold opacity-80">د.ع</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <div className="bg-white/15 rounded-2xl p-2.5">
                <div className="opacity-80">إجمالي الأرباح</div>
                <div className="font-black mt-0.5">
                  {Number(wallet?.total_earned ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white/15 rounded-2xl p-2.5">
                <div className="opacity-80">إجمالي العمولة</div>
                <div className="font-black mt-0.5">
                  {Number(wallet?.total_commission ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}
        {isDriver && txs.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> آخر الحركات
            </div>
            <ul className="space-y-1.5">
              {txs.map((t) => (
                <li key={t.id} className="glass rounded-2xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold">{t.note ?? t.type}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("ar-IQ")}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-black ${Number(t.amount) >= 0 ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {Number(t.amount) >= 0 ? "+" : ""}
                    {Number(t.amount).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Role Switching Section in Profile */}
        <div className="mt-5 glass rounded-3xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black text-foreground">تغيير الدور (الحساب النشط)</h2>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              {roles.length} {roles.length === 1 ? "دور مسجل" : "أدوار مسجلة"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {roles.length > 1
              ? "اختر الدور الذي ترغب في العمل به الآن في التطبيق:"
              : "حسابك الحالي مسجل بالدور أدناه. يمكنك إضافة أدوار أخرى (كسائق أو فني) في أي وقت:"}
          </p>

          <div className="space-y-2">
            {roles.map((r) => {
              const active = activeRole === r;
              const cfg = ROLE_CONFIG[r] || { label: r, desc: "", icon: "✨" };
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    playClick("toggle");
                    setActiveRole(r);
                    toast.success(`تم التبديل إلى دور ${cfg.label}`);
                  }}
                  className={`w-full text-right p-3.5 rounded-2xl flex items-center gap-3 transition btn-press tap-highlight-none border ${
                    active
                      ? "bg-primary/10 border-primary text-foreground shadow-sm"
                      : "bg-surface/50 border-border/50 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <div
                    className={`h-11 w-11 rounded-xl grid place-items-center text-xl shrink-0 ${
                      active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted"
                    }`}
                  >
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-black ${active ? "text-primary" : "text-foreground"}`}
                      >
                        {cfg.label}
                      </span>
                      {active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                          النشط حالياً
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {cfg.desc}
                    </div>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ${
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {active && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {isAdmin && (
            <Link
              to="/admin"
              className="w-full glass rounded-2xl p-4 flex items-center gap-3 btn-press text-right"
            >
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="flex-1 font-bold text-sm">لوحة الإدارة</span>
            </Link>
          )}
          <button
            onClick={() => navigate({ to: "/select-role" })}
            className="w-full glass rounded-2xl p-4 flex items-center gap-3 btn-press text-right"
          >
            <Settings className="h-5 w-5 text-primary" />
            <span className="flex-1 font-bold text-sm">التسجيل في دور جديد</span>
          </button>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
            className="w-full glass rounded-2xl p-4 flex items-center gap-3 btn-press text-right text-destructive"
          >
            <LogOut className="h-5 w-5" />
            <span className="flex-1 font-bold text-sm">تسجيل الخروج</span>
          </button>
        </div>
        <div className="mt-6 text-center text-[11px] text-muted-foreground">ممنون · v2.0</div>
      </div>
    </MobileShell>
  );
}
