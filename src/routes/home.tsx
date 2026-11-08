import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import {
  Car,
  Wrench,
  Power,
  Bell,
  Sun,
  Moon,
  Zap,
  ShieldCheck,
  Sparkles,
  ArrowUpLeft,
  TrendingUp,
  Clock,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { toast } from "@/lib/toast";
import { useServerFn } from "@tanstack/react-start";
import { acceptServiceRequest } from "@/lib/dispatch.functions";
import { useTheme } from "@/lib/use-theme";
import { playClick } from "@/lib/click-sound";

export const Route = createFileRoute("/home")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الرئيسية | ممنون" },
      { name: "description", content: "اطلب تاكسي أو خدمات منزلية وتابع طلباتك في ممنون." },
      { property: "og:title", content: "الرئيسية | ممنون" },
      { property: "og:description", content: "اطلب تاكسي أو خدمات منزلية وتابع طلباتك في ممنون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 5) return "مساء الخير";
  if (h < 12) return "صباح الخير";
  if (h < 18) return "نهارك سعيد";
  return "مساء الخير";
}

function HomePage() {
  const { loading, session, profile, roles } = useAuth();
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  const { theme, toggle } = useTheme();
  const greet = useMemo(greetingByHour, []);

  useEffect(() => {
    if (!roles.length) return;
    if (activeRole && roles.includes(activeRole)) return;
    const saved = localStorage.getItem("mumnun-active-role") as AppRole | null;
    setActiveRole(saved && roles.includes(saved) ? saved : roles[0]);
  }, [roles, activeRole]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (!roles.length) return <Navigate to="/select-role" />;

  const firstName = (profile?.full_name || "صديقنا").split(" ")[0];

  return (
    <MobileShell>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-float" />
        <div
          className="absolute -top-10 -left-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl animate-float"
          style={{ animationDelay: "-3s" }}
        />
      </div>

      <div className="relative px-5 pt-10 pb-6">
        <div className="flex items-center justify-between mb-6 animate-pop-in">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-primary/80 uppercase">
              {greet}
            </div>
            <div className="text-2xl font-black leading-tight mt-0.5 text-foreground">
              {firstName} <span className="inline-block animate-float">👋</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playClick("toggle");
                toggle();
              }}
              aria-label="تبديل الوضع"
              className="glass-strong h-11 w-11 rounded-2xl grid place-items-center btn-press tap-highlight-none relative overflow-hidden"
            >
              <Sun
                className={`h-5 w-5 absolute transition-all duration-500 ${theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
              />
              <Moon
                className={`h-5 w-5 absolute transition-all duration-500 ${theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`}
              />
            </button>
            <NotificationsBell />
          </div>
        </div>

        {roles.length > 1 && (
          <div className="relative flex bg-surface-2 rounded-2xl p-1 mb-5 text-xs font-bold animate-pop-in">
            {roles.map((r) => {
              const active = activeRole === r;
              return (
                <button
                  key={r}
                  onClick={() => {
                    playClick("soft");
                    setActiveRole(r);
                    localStorage.setItem("mumnun-active-role", r);
                  }}
                  className={`relative flex-1 py-2.5 rounded-xl btn-press tap-highlight-none transition-colors ${
                    active
                      ? "text-primary-foreground font-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_6px_20px_-8px_var(--color-primary)]" />
                  )}
                  <span className="relative">
                    {r === "customer" ? "زبون" : r === "driver" ? "كابتن" : "فني"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeRole === "customer" && <CustomerHome />}
        {activeRole === "driver" && <ProviderHome type="taxi" />}
        {activeRole === "worker" && <ProviderHome type="service" />}
      </div>
    </MobileShell>
  );
}

function CustomerHome() {
  return (
    <div className="space-y-4">
      <div className="relative rounded-3xl p-6 overflow-hidden animate-pop-in shadow-elegant bg-gradient-to-br from-primary via-primary-glow to-accent text-primary-foreground">
        <div className="absolute inset-0 shine opacity-40 mix-blend-overlay" />
        <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-[10px] font-bold">
            <Sparkles className="h-3 w-3" /> مجاناً بلا عمولة
          </div>
          <div className="text-2xl font-black mt-2 leading-tight">
            اطلب الآن، ادفع للمزوّد مباشرة
          </div>
          <div className="text-xs opacity-90 mt-1">
            ممنون منصّة مجانية وسريعة — بدون أي نسبة على طلبك
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <QuickTile
          to="/request/new"
          type="taxi"
          title="طلب سيارة"
          subtitle="خلال دقائق"
          icon={<Car className="h-7 w-7" />}
          gradient="from-amber-500 to-orange-500"
          span={2}
          delay={0.05}
        />
        <QuickTile
          to="/request/new"
          type="service"
          title="طلب فني"
          subtitle="١٦ خدمة"
          icon={<Wrench className="h-6 w-6" />}
          gradient="from-emerald-500 to-teal-400"
          delay={0.1}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 animate-pop-in" style={{ animationDelay: "0.15s" }}>
        <MiniStat icon={<Clock className="h-4 w-4" />} label="أقل من" value="٣ د" />
        <MiniStat icon={<ShieldCheck className="h-4 w-4" />} label="مزودون" value="موثق" />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-sm text-foreground">لماذا ممنون؟</h3>
          <span className="text-[11px] text-muted-foreground font-medium">مميّزاتنا</span>
        </div>
        <div className="space-y-2.5">
          <FeatureRow
            icon={<Zap className="h-5 w-5" />}
            title="سرعة في الاستجابة"
            desc="نوصلك بأقرب سيارة أو فني في منطقتك"
            accent="from-amber-500 to-orange-500"
          />
          <FeatureRow
            icon={<ShieldCheck className="h-5 w-5" />}
            title="أمان مضمون"
            desc="جميع الكباتن والفنيين موثّقون رسمياً"
            accent="from-emerald-500 to-teal-400"
          />
        </div>
      </div>
    </div>
  );
}

function QuickTile({
  to,
  type,
  title,
  subtitle,
  icon,
  gradient,
  span = 1,
  delay = 0,
}: {
  to: string;
  type: "taxi" | "service";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  span?: 1 | 2;
  delay?: number;
}) {
  return (
    <Link
      to={to as any}
      search={{ type } as any}
      onClick={() => playClick("pop")}
      className={`glass rounded-3xl p-4 btn-press shadow-card tap-highlight-none animate-pop-in relative overflow-hidden group ${
        span === 2 ? "col-span-2 min-h-[132px]" : "min-h-[132px]"
      }`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div
        className={`absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity`}
      />
      <div className="relative flex flex-col h-full justify-between">
        <div
          className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${gradient} grid place-items-center text-white shadow-lg`}
        >
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-1">
            <div className="font-black text-base text-foreground group-hover:text-primary transition-colors">
              {title}
            </div>
            <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
      </div>
    </Link>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-3 flex flex-col items-center text-center gap-0.5">
      <div className="text-primary">{icon}</div>
      <div className="font-black text-sm text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: string;
}) {
  return (
    <div className="glass rounded-2xl p-3.5 flex items-center gap-3 btn-press">
      <div
        className={`h-11 w-11 rounded-xl bg-gradient-to-br ${accent} grid place-items-center text-white shadow-md`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</div>
      </div>
    </div>
  );
}

function ProviderHome({ type }: { type: "taxi" | "service" }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptServiceRequest);
  const [available, setAvailable] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ jobs: 0 });
  const table = type === "taxi" ? "driver_profiles" : "worker_profiles";

  useEffect(() => {
    if (!session) return;
    supabase
      .from(table)
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAvailable(data.available);
          const d: any = data;
          setStats({ jobs: d.completed_jobs ?? d.completed_rides ?? 0 });
        }
      });

    async function loadRequests() {
      const { data } = await supabase
        .from("service_requests")
        .select(
          "id, pickup_text, dest_text, notes, created_at, service_id, type, price_estimate, customer_price, pricing_mode, work_hours, work_description",
        )
        .in("status", ["pending", "searching"])
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(20);
      setRequests(data ?? []);
    }
    loadRequests();

    const channel = supabase
      .channel("provider-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () =>
        loadRequests(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, type, table]);

  async function toggleAvail() {
    playClick("toggle");
    const prev = available;
    const next = !prev;
    setAvailable(next);
    const { error } = await supabase
      .from(table)
      .update({ available: next })
      .eq("user_id", session!.user.id);
    if (error) {
      setAvailable(prev);
      toast.error("تعذّر تحديث الحالة");
    }
  }

  async function accept(id: string) {
    playClick("pop");
    try {
      await acceptFn({ data: { requestId: id } });
      toast.success("تم قبول الطلب");
      navigate({ to: `/request/$id`, params: { id } });
    } catch (e: any) {
      toast.error(e.message ?? "تعذّر قبول الطلب");
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`relative rounded-3xl p-5 overflow-hidden animate-pop-in shadow-card ${
          available ? "bg-gradient-to-br from-emerald-500 to-teal-400 text-white" : "glass"
        }`}
      >
        {available && <div className="absolute inset-0 shine opacity-30 mix-blend-overlay" />}
        <div className="relative flex items-center justify-between">
          <div>
            <div className={`text-xs ${available ? "text-white/80" : "text-muted-foreground"}`}>
              حالة التوفر
            </div>
            <div className="font-black text-lg mt-0.5">{available ? "متاح للعمل" : "غير متاح"}</div>
          </div>
          <button
            onClick={toggleAvail}
            className={`h-14 w-14 rounded-2xl grid place-items-center btn-press transition ${
              available ? "bg-white/25 backdrop-blur" : "bg-surface-2"
            }`}
          >
            <Power className={`h-6 w-6 ${available ? "text-white" : "text-muted-foreground"}`} />
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 animate-pop-in" style={{ animationDelay: "0.05s" }}>
        <div className="text-xs text-muted-foreground">الطلبات المكتملة</div>
        <div className="font-black text-lg mt-1">{stats.jobs}</div>
      </div>

      <div>
        <h3 className="font-black mb-3 mt-2">الطلبات المتاحة</h3>
        {!available && (
          <div className="glass rounded-2xl p-4 text-center text-sm text-muted-foreground">
            فعّل التوفر لعرض الطلبات
          </div>
        )}
        {available && requests.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات جديدة الآن
          </div>
        )}
        {available &&
          requests.map((r, i) => (
            <div
              key={r.id}
              className="glass rounded-2xl p-4 mb-2.5 animate-pop-in"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">
                    📍 {r.pickup_text || "بدون عنوان"}
                  </div>
                  {r.dest_text && (
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      🎯 {r.dest_text}
                    </div>
                  )}
                  {r.work_description && (
                    <div className="text-xs mt-1 line-clamp-2">🛠️ {r.work_description}</div>
                  )}
                  {(r.customer_price || r.price_estimate) && (
                    <div className="text-sm font-black text-primary mt-1">
                      💰 {(r.customer_price ?? r.price_estimate).toLocaleString()} د.ع
                      {r.pricing_mode === "hourly" && r.work_hours
                        ? ` · ${r.work_hours} ساعة`
                        : r.pricing_mode === "fixed"
                          ? " · إنجاز تام"
                          : ""}
                    </div>
                  )}
                  {r.pricing_mode === "negotiable" && (
                    <div className="text-xs font-bold text-primary mt-1">
                      💰 السعر يتفق عليه وياك
                    </div>
                  )}
                  {r.notes && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      📝 {r.notes}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => accept(r.id)}
                  className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold text-xs btn-press shadow-md"
                >
                  قبول
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
