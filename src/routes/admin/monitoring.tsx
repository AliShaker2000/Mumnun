import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, Activity, Users, Car, AlertTriangle, TrendingUp, ChevronLeft, Eye, Ban, Flag, Headphones, Database } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/monitoring")({ ssr: false, component: LiveMonitoring });

function LiveMonitoring() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<any>({});
  const [reports, setReports] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [tab, setTab] = useState("live");

  const checkAuth = useCallback(async () => {
    if (!session) return;
    const { data } = await (supabase as any).rpc("has_staff_role", { p_user_id: session.user.id });
    setAuthorized(!!data);
  }, [session]);

  useEffect(() => { if (!session) return; checkAuth(); }, [session, checkAuth]);

  const loadData = useCallback(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, drivers, workers, activeReq, pendingRep, blk, tck] = await Promise.all([
      (supabaseAdmin as any).from("profiles").select("id", { count: "exact", head: true }),
      (supabaseAdmin as any).from("driver_profiles").select("id", { count: "exact", head: true }).eq("available", true),
      (supabaseAdmin as any).from("worker_profiles").select("id", { count: "exact", head: true }).eq("available", true),
      (supabaseAdmin as any).from("service_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "searching", "accepted", "in_progress"]),
      (supabaseAdmin as any).from("user_reports").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(20),
      (supabaseAdmin as any).from("user_blocks").select("*, profiles!user_blocks_user_id_fkey(full_name)").order("blocked_at", { ascending: false }).limit(20),
      (supabaseAdmin as any).from("support_tickets").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(20),
    ]);
    setStats({ totalUsers: users.count ?? 0, activeDrivers: drivers.count ?? 0, activeWorkers: workers.count ?? 0, activeRequests: activeReq.count ?? 0 });
    setReports(pendingRep.data ?? []); setBlocks(blk.data ?? []); setTickets(tck.data ?? []);
  }, []);

  useEffect(() => { if (authorized === true) loadData(); const interval = setInterval(() => { if (authorized) loadData(); }, 15000); return () => clearInterval(interval); }, [authorized, loadData]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (authorized === null) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!authorized) return (<div className="min-h-screen grid place-items-center px-5"><div className="text-center"><ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-2" /><div className="font-black">غير مصرّح</div><Link to="/admin" className="inline-block mt-4 text-primary text-sm font-bold">العودة للوحة الإدارة</Link></div></div>);

  return (
    <div className="min-h-screen px-5 pt-10 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2"><Link to="/admin" className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link><Activity className="h-6 w-6 text-primary" /><h1 className="text-2xl font-black">المراقبة المباشرة</h1></div>
      <div className="flex gap-1 mb-6 p-1 glass rounded-2xl">{[["live", "مباشر"], ["reports", "البلاغات"], ["blocks", "الحظر"], ["support", "الدعم"]].map(([key, label]) => (<button key={key} onClick={() => setTab(key)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>))}</div>
      {tab === "live" && (<div className="space-y-3"><div className="grid grid-cols-2 gap-3"><LiveStat icon={Users} label="إجمالي المستخدمين" value={stats.totalUsers} /><LiveStat icon={Car} label="سائقون نشطون" value={stats.activeDrivers} accent="text-emerald-600" /><LiveStat icon={TrendingUp} label="فنيون نشطون" value={stats.activeWorkers} accent="text-amber-600" /><LiveStat icon={Activity} label="طلبات نشطة" value={stats.activeRequests} accent="text-blue-600" /></div><div className="glass rounded-2xl p-3 text-center text-xs text-muted-foreground"><Database className="h-4 w-4 inline ml-1" />يتم تحديث البيانات كل 15 ثانية</div></div>)}
      {tab === "reports" && (<div className="space-y-2">{reports.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Flag className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا توجد بلاغات معلقة</div></div> : reports.map((r) => (<div key={r.id} className="glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between mb-1"><span className="font-bold">{r.reason}</span><span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-IQ")}</span></div>{r.details && <div className="text-xs text-muted-foreground">{r.details}</div>}<div className="flex gap-2 mt-2"><button onClick={async () => { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); await (supabaseAdmin as any).from("user_reports").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: session.user.id }).eq("id", r.id); toast.success("تم حل البلاغ"); loadData(); }} className="text-xs px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold">حل</button><button onClick={async () => { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); if (r.reported_id) { await (supabaseAdmin as any).from("user_blocks").upsert({ user_id: r.reported_id, blocked_by: session.user.id, reason: r.reason }, { onConflict: "user_id" }); toast.success("تم حظر المستخدم"); } await (supabaseAdmin as any).from("user_reports").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: session.user.id }).eq("id", r.id); loadData(); }} className="text-xs px-3 py-1 rounded-lg bg-red-100 text-red-700 font-bold">حظر المستخدم</button></div></div>))}</div>)}
      {tab === "blocks" && (<div className="space-y-2">{blocks.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Ban className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا يوجد مستخدمون محظورون</div></div> : blocks.map((b) => (<div key={b.id} className="glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between"><div><div className="font-bold">{b.profiles?.full_name ?? b.user_id.slice(0, 8)}</div>{b.reason && <div className="text-xs text-muted-foreground">{b.reason}</div>}</div><button onClick={async () => { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); await (supabaseAdmin as any).from("user_blocks").delete().eq("user_id", b.user_id); toast.success("تم رفع الحظر"); loadData(); }} className="text-xs px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold">رفع الحظر</button></div></div>))}</div>)}
      {tab === "support" && (<div className="space-y-2">{tickets.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><Headphones className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><div className="text-sm text-muted-foreground">لا توجد تذاكر دعم مفتوحة</div></div> : tickets.map((t) => (<Link key={t.id} to="/support" className="block glass rounded-2xl p-3 text-sm"><div className="flex items-center justify-between"><div className="font-bold">{t.subject}</div><span className="text-[10px] text-muted-foreground">{t.category}</span></div><div className="text-xs text-muted-foreground mt-1">{t.description}</div></Link>))}</div>)}
    </div>
  );
}

function LiveStat({ icon: Icon, label, value, accent }: any) { return (<div className="glass rounded-2xl p-4"><Icon className={`h-5 w-5 mb-2 ${accent ?? "text-primary"}`} /><div className="text-xl font-black">{value ?? "—"}</div><div className="text-[10px] text-muted-foreground font-bold mt-0.5">{label}</div></div>); }
