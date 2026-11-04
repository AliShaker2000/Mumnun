import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { adminGetPlans, adminSavePlan, adminTogglePlan, adminGetSettings, adminSaveSettings, adminGetStats, adminGetSubscriptions } from "@/lib/subscription.functions";
import { Loader2, ShieldCheck, Crown, Award, Sparkles, ToggleLeft, ToggleRight, Users, TrendingUp, Calendar, AlertCircle, Plus, Save, X, BadgeCheck, Headphones, BarChart3, Star, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/subscriptions")({ ssr: false,
  head: () => ({ meta: [
    { title: "إدارة الاشتراكات | ممنون" },
    { name: "description", content: "إدارة خطط واشتراكات منصة ممنون." },
    { property: "og:title", content: "إدارة الاشتراكات | ممنون" },
    { property: "og:description", content: "إدارة خطط واشتراكات منصة ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: SubscriptionsAdmin });

type Plan = { id: string; code: string; name_ar: string; name_en: string; description_ar: string | null; tier: number; max_requests_per_month: number | null; priority_weight: number; offer_priority: number; badge_label: string | null; badge_color: string | null; show_stats: boolean; priority_support: boolean; monthly_price: number; yearly_price: number; currency: string; is_active: boolean; sort_order: number };
type Stats = { totalSubscribers: number; activeSubscriptions: number; expiredSubscriptions: number; monthlyRevenue: number; yearlyRevenue: number; freeCount: number; silverCount: number; goldCount: number };
type SubscriptionRow = { id: string; user_id: string; status: string; billing_cycle: string; current_period_start: string; current_period_end: string | null; request_count: number; auto_renew: boolean; created_at: string; plan: { code: string; name_ar: string; tier: number } | null };

function SubscriptionsAdmin() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [tab, setTab] = useState("overview");
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [plansData, settingsData, statsData, subsData] = await Promise.all([adminGetPlans(), adminGetSettings(), adminGetStats(), adminGetSubscriptions()]);
      setPlans(plansData as Plan[]); setSettings(settingsData); setStats(statsData as Stats); setSubs(subsData as SubscriptionRow[]);
    } catch (e: any) { toast.error(e.message); }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) { setAuthorized(false); return; }
    (async () => {
      try {
        const { data: roleData } = await (supabase as any).rpc("has_admin_access", { p_user_id: session.user.id });
        if (roleData) { setAuthorized(true); loadAll(); } else { setAuthorized(false); }
      } catch { setAuthorized(false); }
    })();
  }, [session, loading, loadAll]);

  if (loading) return <Loader2 className="h-8 w-8 animate-spin mx-auto mt-20" />;
  if (authorized === false) return <Navigate to="/auth" />;
  if (authorized !== true) return <Loader2 className="h-8 w-8 animate-spin mx-auto mt-20" />;

  return (
    <div className="min-h-screen bg-background p-4 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4"><Link to="/admin" className="glass rounded-xl p-2"><ChevronLeft className="h-5 w-5" /></Link><h1 className="text-lg font-black flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />نظام الاشتراكات</h1></div>
      <div className="flex gap-1 mb-4 glass rounded-2xl p-1">{["overview", "plans", "subscriptions", "settings"].map((t) => (<button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t === "overview" ? "نظرة عامة" : t === "plans" ? "الباقات" : t === "subscriptions" ? "المشتركون" : "الإعدادات"}</button>))}</div>
      {tab === "overview" && <OverviewTab stats={stats} settings={settings} />}
      {tab === "plans" && <PlansTab plans={plans} onEdit={(p: Plan) => { setEditingPlan(p); setShowEditModal(true); }} onToggle={async (id: string, isActive: boolean) => { try { await adminTogglePlan({ data: { id, is_active: isActive } }); toast.success(isActive ? "تم تفعيل الباقة" : "تم إيقاف الباقة"); loadAll(); } catch (e: any) { toast.error(e.message); } }} onNew={() => { setEditingPlan(null); setShowEditModal(true); }} />}
      {tab === "subscriptions" && <SubscriptionsTab subs={subs} />}
      {tab === "settings" && <SettingsTab settings={settings} onSave={async (enabled: boolean, minDownloads: number) => { try { await adminSaveSettings({ data: { subscription_enabled: enabled, minimum_downloads_before_activation: minDownloads } }); toast.success("تم حفظ الإعدادات"); loadAll(); } catch (e: any) { toast.error(e.message); } }} />}
      {showEditModal && <PlanEditModal plan={editingPlan} onClose={() => setShowEditModal(false)} onSave={async (planData: Partial<Plan>) => { try { await adminSavePlan({ data: { id: editingPlan?.id, plan: planData } }); toast.success(editingPlan ? "تم تحديث الباقة" : "تم إنشاء الباقة"); setShowEditModal(false); loadAll(); } catch (e: any) { toast.error(e.message); } }} />}
    </div>
  );
}

function OverviewTab({ stats, settings }: { stats: Stats | null; settings: any }) {
  if (!stats || !settings) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;
  const enabled = settings?.subscription_enabled ?? false;
  return (
    <div className="space-y-4">
      <div className={`glass rounded-2xl p-4 ${enabled ? "border-2 border-emerald-500" : ""}`}><div className="flex items-center justify-between"><div><div className="font-black text-sm">حالة نظام الاشتراكات</div><div className="text-xs text-muted-foreground mt-0.5">{enabled ? "مُفعّل — يعمل النظام" : "مُعطّل — الجميع يعمل مجاناً"}</div></div>{enabled ? <ToggleRight className="h-10 w-10 text-emerald-500" /> : <ToggleLeft className="h-10 w-10 text-muted-foreground" />}</div></div>
      <div className="grid grid-cols-2 gap-3"><StatCard icon={Users} label="إجمالي المشتركين" value={stats.totalSubscribers} /><StatCard icon={TrendingUp} label="اشتراكات نشطة" value={stats.activeSubscriptions} accent="text-emerald-600" /><StatCard icon={AlertCircle} label="اشتراكات منتهية" value={stats.expiredSubscriptions} accent="text-red-500" /><StatCard icon={Calendar} label="أرباح شهرية" value={stats.monthlyRevenue ? `${stats.monthlyRevenue.toLocaleString()} د.ع` : "—"} accent="text-amber-600" /></div>
      <div className="glass rounded-2xl p-4"><div className="font-black text-sm mb-3">الأرباح السنوية</div><div className="text-2xl font-black text-amber-600">{stats.yearlyRevenue ? `${stats.yearlyRevenue.toLocaleString()} د.ع` : "—"}</div></div>
      <div className="glass rounded-2xl p-4"><div className="font-black text-sm mb-3">توزيع المشتركين</div><div className="space-y-2"><PlanCountRow label="مجاني" count={stats.freeCount} color="bg-slate-400" /><PlanCountRow label="فضية" count={stats.silverCount} color="bg-slate-300" /><PlanCountRow label="ذهبية" count={stats.goldCount} color="bg-amber-400" /></div></div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: any) { return (<div className="glass rounded-2xl p-4"><Icon className={`h-5 w-5 mb-2 ${accent ?? "text-primary"}`} /><div className="text-xl font-black">{value ?? "—"}</div><div className="text-[10px] text-muted-foreground font-bold mt-0.5">{label}</div></div>); }
function PlanCountRow({ label, count, color }: any) { return (<div className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${color}`} /><span className="font-bold">{label}</span></div><span className="font-black">{count}</span></div>); }

function PlansTab({ plans, onEdit, onToggle, onNew }: any) {
  return (
    <div className="space-y-3">
      <button onClick={onNew} className="w-full glass rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-bold text-primary border-2 border-dashed border-primary/30"><Plus className="h-4 w-4" /> إضافة باقة جديدة</button>
      {plans.map((p: Plan) => (
        <div key={p.id} className={`glass rounded-2xl p-4 ${!p.is_active ? "opacity-50" : ""}`}>
          <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-2">{p.tier === 0 ? <Sparkles className="h-5 w-5 text-slate-400" /> : p.tier === 1 ? <Award className="h-5 w-5 text-slate-300" /> : <Crown className="h-5 w-5 text-amber-500" />}<div><div className="font-black text-sm">{p.name_ar}</div><div className="text-[10px] text-muted-foreground">{p.code}</div></div></div><button onClick={() => onToggle(p.id, !p.is_active)} className="text-xs">{p.is_active ? <ToggleRight className="h-7 w-7 text-emerald-500" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}</button></div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3"><Feature icon={Star} label="طلبات/شهر" value={p.max_requests_per_month == null ? "غير محدود" : String(p.max_requests_per_month)} /><Feature icon={TrendingUp} label="أولوية الظهور" value={String(p.priority_weight)} /><Feature icon={BadgeCheck} label="الشارة" value={p.badge_label ?? "—"} /><Feature icon={BarChart3} label="الإحصائيات" value={p.show_stats ? "نعم" : "لا"} /><Feature icon={Headphones} label="الدعم المميز" value={p.priority_support ? "نعم" : "لا"} /><Feature icon={TrendingUp} label="أولوية العروض" value={String(p.offer_priority)} /></div>
          <div className="flex items-center justify-between text-xs mb-3"><span className="text-muted-foreground">شهري: <span className="font-black text-foreground">{p.monthly_price.toLocaleString()} د.ع</span></span><span className="text-muted-foreground">سنوي: <span className="font-black text-foreground">{p.yearly_price.toLocaleString()} د.ع</span></span></div>
          <button onClick={() => onEdit(p)} className="w-full py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold">تعديل الباقة</button>
        </div>
      ))}
    </div>
  );
}

function Feature({ icon: Icon, label, value }: any) { return (<div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{label}:</span><span className="font-bold">{value}</span></div>); }

function SubscriptionsTab({ subs }: { subs: SubscriptionRow[] }) {
  if (subs.length === 0) return (<div className="glass rounded-2xl p-8 text-center"><Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا يوجد مشتركون بعد</div></div>);
  return (<div className="space-y-2">{subs.map((s) => (<div key={s.id} className="glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between mb-1"><div className="font-bold">{s.plan?.name_ar ?? "—"}</div><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : s.status === "expired" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{s.status === "active" ? "نشط" : s.status === "expired" ? "منتهي" : s.status}</span></div><div className="text-[10px] text-muted-foreground">المستخدم: {s.user_id.slice(0, 8)}... · طلبات: {s.request_count}</div>{s.current_period_end && <div className="text-[10px] text-muted-foreground">ينتهي: {new Date(s.current_period_end).toLocaleDateString("ar-IQ")}</div>}</div>))}</div>);
}

function SettingsTab({ settings, onSave }: any) {
  const [enabled, setEnabled] = useState(false);
  const [minDownloads, setMinDownloads] = useState(100000);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings) { setEnabled(settings.subscription_enabled ?? false); setMinDownloads(settings.minimum_downloads_before_activation ?? 100000); } }, [settings]);
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4"><div className="flex items-center justify-between mb-1"><div><div className="font-black text-sm">تفعيل نظام الاشتراكات</div><div className="text-xs text-muted-foreground mt-0.5">عند الإيقاف: الجميع يعمل مجاناً بلا قيود</div></div><button onClick={() => setEnabled(!enabled)}>{enabled ? <ToggleRight className="h-10 w-10 text-emerald-500" /> : <ToggleLeft className="h-10 w-10 text-muted-foreground" />}</button></div></div>
      <div className="glass rounded-2xl p-4"><div className="font-black text-sm mb-2">الحد الأدنى للتحميلات قبل التفعيل</div><div className="text-xs text-muted-foreground mb-3">عدد تحميلات التطبيق المطلوبة قبل بدء نظام الاشتراكات</div><input type="number" value={minDownloads} onChange={(e) => setMinDownloads(Number(e.target.value))} className="w-full glass rounded-xl px-4 py-3 text-sm font-bold outline-none" min={0} /></div>
      <button onClick={async () => { setSaving(true); await onSave(enabled, minDownloads); setSaving(false); }} disabled={saving} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الإعدادات</button>
    </div>
  );
}

function PlanEditModal({ plan, onClose, onSave }: any) {
  const [form, setForm] = useState<any>(plan ?? { code: "", name_ar: "", name_en: "", description_ar: "", tier: 0, max_requests_per_month: 50, priority_weight: 0, offer_priority: 0, badge_label: "", badge_color: "", show_stats: false, priority_support: false, monthly_price: 0, yearly_price: 0, currency: "IQD", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4 overflow-y-auto">
      <div className="glass rounded-3xl p-5 w-full max-w-md my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4"><h2 className="font-black">{plan ? "تعديل الباقة" : "إضافة باقة"}</h2><button onClick={onClose}><X className="h-5 w-5" /></button></div>
        <div className="space-y-3">
          <Field label="الكود (بالإنجليزية)"><input value={form.code} onChange={(e) => upd("code", e.target.value)} className="input-base" disabled={!!plan} /></Field>
          <Field label="الاسم بالعربية"><input value={form.name_ar} onChange={(e) => upd("name_ar", e.target.value)} className="input-base" /></Field>
          <Field label="الاسم بالإنجليزية"><input value={form.name_en} onChange={(e) => upd("name_en", e.target.value)} className="input-base" /></Field>
          <Field label="الوصف"><textarea value={form.description_ar ?? ""} onChange={(e) => upd("description_ar", e.target.value)} className="input-base" rows={2} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="المستوى (Tier)"><input type="number" value={form.tier} onChange={(e) => upd("tier", Number(e.target.value))} className="input-base" min={0} /></Field><Field label="حد الطلبات/شهر (فارغ=غير محدود)"><input type="number" value={form.max_requests_per_month ?? ""} onChange={(e) => upd("max_requests_per_month", e.target.value === "" ? null : Number(e.target.value))} className="input-base" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="أولوية الظهور"><input type="number" value={form.priority_weight} onChange={(e) => upd("priority_weight", Number(e.target.value))} className="input-base" min={0} /></Field><Field label="أولوية استقبال العروض"><input type="number" value={form.offer_priority} onChange={(e) => upd("offer_priority", Number(e.target.value))} className="input-base" min={0} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="نص الشارة"><input value={form.badge_label ?? ""} onChange={(e) => upd("badge_label", e.target.value)} className="input-base" placeholder="مثال: ذهبي" /></Field><Field label="لون الشارة"><input value={form.badge_color ?? ""} onChange={(e) => upd("badge_color", e.target.value)} className="input-base" placeholder="#f59e0b" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="السعر الشهري (د.ع)"><input type="number" value={form.monthly_price} onChange={(e) => upd("monthly_price", Number(e.target.value))} className="input-base" min={0} /></Field><Field label="السعر السنوي (د.ع)"><input type="number" value={form.yearly_price} onChange={(e) => upd("yearly_price", Number(e.target.value))} className="input-base" min={0} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="ترتيب العرض"><input type="number" value={form.sort_order} onChange={(e) => upd("sort_order", Number(e.target.value))} className="input-base" min={0} /></Field><Field label="العملة"><input value={form.currency} onChange={(e) => upd("currency", e.target.value)} className="input-base" /></Field></div>
          <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_stats} onChange={(e) => upd("show_stats", e.target.checked)} />إظهار الإحصائيات</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.priority_support} onChange={(e) => upd("priority_support", e.target.checked)} />دعم فني مميز</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => upd("is_active", e.target.checked)} />مفعّلة</label></div>
        </div>
        <button onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }} disabled={saving} className="w-full mt-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</button>
      </div>
    </div>
  );
}

function Field({ label, children }: any) { return (<div><div className="text-[11px] font-bold text-muted-foreground mb-1">{label}</div>{children}</div>); }
