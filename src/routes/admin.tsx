import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ShieldCheck, Users, Car, ListChecks, Wallet, Crown, Activity,
  LayoutDashboard, Tag, MessageSquare, UserCheck, Flag, Bell, ScrollText,
  Map, ChevronLeft, Settings, AlertCircle,
} from "lucide-react";
import {
  adminAdjustWallet, adminBlockUser, adminBroadcastNotification, adminCancelRequest,
  adminDeleteCoupon, adminDeleteFriendRequest, adminDeleteFriendship, adminDeleteMessage,
  adminGetDashboardStats, adminGetLiveLocations, adminGetLiveRequests, adminGetUserDetail,
  adminGrantRole, adminListAuditLogs, adminListChats, adminListCoupons, adminListFriendRequests,
  adminListFriends, adminListMessages, adminListProviders, adminListReports, adminListRequests,
  adminListTransactions, adminListUsers, adminReopenRequest, adminResolveReport, adminRevokeRole,
  adminSaveCoupon, adminSearchUsers, adminSetProviderStatus, adminUnblockUser,
} from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/admin")({ ssr: false,
  head: () => ({ meta: [
    { title: "إدارة ممنون | ممنون" },
    { name: "description", content: "إدارة مستخدمي وطلبات منصة ممنون." },
    { property: "og:title", content: "إدارة ممنون | ممنون" },
    { property: "og:description", content: "إدارة مستخدمي وطلبات منصة ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: AdminPage });

type Section = "overview" | "users" | "providers" | "requests" | "chat" | "friends" | "reports" | "subscriptions" | "coupons" | "wallet" | "stats" | "map" | "notifications" | "audit" | "roles";

const NAV_ITEMS: { key: Section; label: string; icon: any; roles: string[] }[] = [
  { key: "overview", label: "نظرة عامة", icon: LayoutDashboard, roles: ["super_admin", "admin", "support", "finance", "moderator"] },
  { key: "stats", label: "الإحصائيات", icon: Activity, roles: ["super_admin", "admin", "finance"] },
  { key: "users", label: "المستخدمون", icon: Users, roles: ["super_admin", "admin", "support", "moderator"] },
  { key: "providers", label: "السائقون والفنيون", icon: Car, roles: ["super_admin", "admin", "support"] },
  { key: "requests", label: "الطلبات", icon: ListChecks, roles: ["super_admin", "admin", "support"] },
  { key: "chat", label: "الدردشة", icon: MessageSquare, roles: ["super_admin", "admin", "moderator"] },
  { key: "friends", label: "الأصدقاء", icon: UserCheck, roles: ["super_admin", "admin", "moderator"] },
  { key: "reports", label: "البلاغات", icon: Flag, roles: ["super_admin", "admin", "support", "moderator"] },
  { key: "subscriptions", label: "الاشتراكات", icon: Crown, roles: ["super_admin", "admin", "finance"] },
  { key: "coupons", label: "الكوبونات", icon: Tag, roles: ["super_admin", "admin", "finance"] },
  { key: "wallet", label: "المحفظة", icon: Wallet, roles: ["super_admin", "admin", "finance"] },
  { key: "map", label: "الخريطة المباشرة", icon: Map, roles: ["super_admin", "admin", "support"] },
  { key: "notifications", label: "الإشعارات", icon: Bell, roles: ["super_admin", "admin", "support", "finance", "moderator"] },
  { key: "roles", label: "الصلاحيات", icon: Settings, roles: ["super_admin"] },
  { key: "audit", label: "سجل العمليات", icon: ScrollText, roles: ["super_admin", "admin"] },
];

function AdminPage() {
  const { session, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!session || loading) return;
    (async () => {
      try {
        const { data: isStaff } = await (supabase as any).rpc("has_staff_role", { p_user_id: session.user.id });
        if (!isStaff) { setAuthorized(false); return; }
        const { data: roles } = await (supabase as any).rpc("get_staff_roles", { p_user_id: session.user.id });
        setStaffRoles((roles ?? []).map((r: any) => r));
        setAuthorized(true);
      } catch {
        setAuthorized(false);
      }
    })();
  }, [session, loading]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (authorized === null) return (
    <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  );
  if (!authorized) return (
    <div className="min-h-screen grid place-items-center px-5">
      <div className="text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <div className="font-black">غير مصرّح</div>
        <div className="text-xs text-muted-foreground">هذه الصفحة للمشرفين فقط</div>
        <Link to="/" className="inline-block mt-4 text-primary text-sm font-bold">العودة للرئيسية</Link>
      </div>
    </div>
  );

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.some((r) => staffRoles.includes(r)));

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`fixed lg:sticky top-0 right-0 z-40 h-screen w-72 glass border-l border-border overflow-y-auto transition-transform ${
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      }`}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-black">لوحة الإدارة</h1>
          </div>
          <nav className="space-y-1">
            {visibleItems.map((item) => (
              <button key={item.key} onClick={() => { setSection(item.key); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  section === item.key ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-surface-2"
                }`}>
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
          <Link to="/" className="mt-6 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-4">
            <ChevronLeft className="h-4 w-4" /> العودة للتطبيق
          </Link>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <main className="flex-1 min-w-0">
        <div className="lg:hidden sticky top-0 z-20 glass border-b px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg bg-surface-2"><LayoutDashboard className="h-5 w-5" /></button>
          <span className="font-black text-sm">لوحة الإدارة</span>
          <div className="w-9" />
        </div>
        <div className="p-4 lg:p-8 max-w-5xl mx-auto">
          {section === "overview" && <OverviewSection />}
          {section === "stats" && <StatsSection />}
          {section === "users" && <UsersSection />}
          {section === "providers" && <ProvidersSection />}
          {section === "requests" && <RequestsSection />}
          {section === "chat" && <ChatSection />}
          {section === "friends" && <FriendsSection />}
          {section === "reports" && <ReportsSection />}
          {section === "subscriptions" && <SubscriptionsSection />}
          {section === "coupons" && <CouponsSection />}
          {section === "wallet" && <WalletSection />}
          {section === "map" && <MapSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "roles" && <RolesSection />}
          {section === "audit" && <AuditSection />}
        </div>
      </main>
    </div>
  );
}

function OverviewSection() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const getStats = useServerFn(adminGetDashboardStats);
  useEffect(() => { (async () => { try { setStats(await getStats()); } catch (e) {} finally { setLoading(false); } })(); }, []);
  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;
  if (!stats) return <div className="text-sm text-muted-foreground">تعذّر تحميل البيانات</div>;
  return (
    <div>
      <h2 className="text-xl font-black mb-4">نظرة عامة</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="المستخدمون" value={stats.totalUsers} />
        <StatCard icon={Car} label="السائقون" value={stats.totalDrivers} />
        <StatCard icon={Activity} label="الفنيون" value={stats.totalWorkers} />
        <StatCard icon={ListChecks} label="الطلبات" value={stats.totalRequests} />
        <StatCard icon={Activity} label="طلبات نشطة" value={stats.activeRequests} accent="text-amber-500" />
        <StatCard icon={ListChecks} label="مكتملة" value={stats.completedRequests} accent="text-emerald-600" />
        <StatCard icon={Wallet} label="أرباح اليوم" value={`${stats.dailyRevenue?.toLocaleString() ?? 0}`} accent="text-emerald-600" />
        <StatCard icon={Wallet} label="أرباح الشهر" value={`${stats.monthlyRevenue?.toLocaleString() ?? 0}`} accent="text-emerald-600" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon className={`h-5 w-5 mb-2 ${accent ?? "text-primary"}`} />
      <div className="text-2xl font-black">{value ?? "—"}</div>
      <div className="text-[10px] text-muted-foreground font-bold mt-0.5">{label}</div>
    </div>
  );
}

function StatsSection() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const getStats = useServerFn(adminGetDashboardStats);
  useEffect(() => { (async () => { try { setStats(await getStats()); } catch (e) {} finally { setLoading(false); } })(); }, []);
  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;
  if (!stats) return <div className="text-sm text-muted-foreground">تعذّر تحميل البيانات</div>;
  return (
    <div>
      <h2 className="text-xl font-black mb-4">الإحصائيات</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard icon={Users} label="إجمالي المستخدمين" value={stats.totalUsers} />
        <StatCard icon={Car} label="إجمالي السائقين" value={stats.totalDrivers} />
        <StatCard icon={Activity} label="إجمالي الفنيين" value={stats.totalWorkers} />
        <StatCard icon={Car} label="سائقون عاملون" value={stats.activeDrivers} accent="text-emerald-600" />
        <StatCard icon={Activity} label="فنيون عاملون" value={stats.activeWorkers} accent="text-emerald-600" />
        <StatCard icon={ListChecks} label="إجمالي الطلبات" value={stats.totalRequests} />
        <StatCard icon={Activity} label="طلبات نشطة" value={stats.activeRequests} accent="text-amber-500" />
        <StatCard icon={ListChecks} label="طلبات مكتملة" value={stats.completedRequests} accent="text-emerald-600" />
        <StatCard icon={AlertCircle} label="طلبات ملغاة" value={stats.cancelledRequests} accent="text-red-500" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-5"><Wallet className="h-5 w-5 text-emerald-600 mb-2" /><div className="text-2xl font-black text-emerald-600">{stats.dailyRevenue?.toLocaleString() ?? 0} د.ع</div><div className="text-xs text-muted-foreground font-bold">أرباح اليوم</div></div>
        <div className="glass rounded-2xl p-5"><Wallet className="h-5 w-5 text-amber-600 mb-2" /><div className="text-2xl font-black text-amber-600">{stats.monthlyRevenue?.toLocaleString() ?? 0} د.ع</div><div className="text-xs text-muted-foreground font-bold">أرباح الشهر</div></div>
        <div className="glass rounded-2xl p-5"><Wallet className="h-5 w-5 text-primary mb-2" /><div className="text-2xl font-black text-primary">{stats.yearlyRevenue?.toLocaleString() ?? 0} د.ع</div><div className="text-xs text-muted-foreground font-bold">أرباح السنة</div></div>
      </div>
    </div>
  );
}

function UsersSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [blockModal, setBlockModal] = useState<any | null>(null);
  const listUsers = useServerFn(adminListUsers);
  const searchUsers = useServerFn(adminSearchUsers);
  const blockUser = useServerFn(adminBlockUser);
  const unblockUser = useServerFn(adminUnblockUser);
  const getUserDetail = useServerFn(adminGetUserDetail);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (searchQuery.trim()) { const r = await searchUsers({ data: { query: searchQuery.trim() } }); setUsers(r); setTotal(r.length); }
      else { const d = await listUsers({ data: { page, limit: 50 } }); setUsers(d.users); setTotal(d.total); }
    } catch (e) {} finally { setLoading(false); }
  }, [page, searchQuery]);
  useEffect(() => { load(); }, [load]);
  async function viewUser(userId: string) { try { setSelectedUser(await getUserDetail({ data: { user_id: userId } })); } catch (e) {} }
  async function handleBlock(userId: string, reason: string, expiresAt: string | null) { try { await blockUser({ data: { user_id: userId, reason, expires_at: expiresAt ?? undefined } }); setBlockModal(null); load(); } catch (e) {} }
  async function handleUnblock(userId: string) { try { await unblockUser({ data: { user_id: userId } }); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة المستخدمين</h2>
      <div className="flex gap-2 mb-4">
        <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder="بحث بالاسم، الهاتف، أو البريد..." className="flex-1 glass rounded-xl px-4 py-2.5 text-sm outline-none" onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        <button onClick={load} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">بحث</button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : users.length === 0 ? <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">لا يوجد مستخدمون</div> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="glass rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-surface-2 grid place-items-center text-sm font-black shrink-0">{(u.full_name || u.phone || "?").charAt(0)}</div>
                <div className="min-w-0"><div className="font-bold text-sm truncate">{u.full_name || "بدون اسم"}</div><div className="text-[10px] text-muted-foreground truncate">{u.phone}</div></div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.blocked ? <button onClick={() => handleUnblock(u.id)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">رفع الحظر</button> : <button onClick={() => setBlockModal({ id: u.id, name: u.full_name })} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">حظر</button>}
                <button onClick={() => viewUser(u.id)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold">تفاصيل</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!searchQuery && total > 50 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg glass text-sm font-bold disabled:opacity-50">السابق</button>
          <span className="text-xs text-muted-foreground">صفحة {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={users.length < 50} className="px-4 py-2 rounded-lg glass text-sm font-bold disabled:opacity-50">التالي</button>
        </div>
      )}
      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
      {blockModal && <BlockModal target={blockModal} onConfirm={handleBlock} onClose={() => setBlockModal(null)} />}
    </div>
  );
}

function UserDetailModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4 overflow-y-auto">
      <div className="glass rounded-3xl p-5 w-full max-w-lg my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4"><h3 className="font-black">تفاصيل المستخدم</h3><button onClick={onClose} className="text-muted-foreground">✕</button></div>
        <div className="space-y-3 text-sm">
          <InfoRow label="الاسم" value={user.profile?.full_name} />
          <InfoRow label="الهاتف" value={user.profile?.phone} />
          <InfoRow label="البريد" value={user.profile?.email ?? "—"} />
          <InfoRow label="تاريخ التسجيل" value={user.profile?.created_at ? new Date(user.profile.created_at).toLocaleString("ar-IQ") : "—"} />
          <div><div className="text-[11px] font-bold text-muted-foreground mb-1">الأدوار</div><div className="flex flex-wrap gap-1">{(user.roles ?? []).map((r: any) => (<span key={r.role} className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/15 text-primary">{r.role}</span>))}{user.roles?.length === 0 && <span className="text-xs text-muted-foreground">لا أدوار</span>}</div></div>
          {user.block && (<div className="glass rounded-xl p-3 border border-red-500/30"><div className="text-xs font-bold text-red-500">محظور</div><div className="text-[10px] text-muted-foreground">{user.block.reason ?? "بدون سبب"}</div>{user.block.expires_at && <div className="text-[10px] text-muted-foreground">حتى: {new Date(user.block.expires_at).toLocaleString("ar-IQ")}</div>}</div>)}
          {user.driverProfile && (<div className="glass rounded-xl p-3"><div className="text-xs font-bold mb-1">ملف السائق</div><InfoRow label="السيارة" value={`${user.driverProfile.vehicle_make ?? "—"} ${user.driverProfile.vehicle_model ?? ""}`} /><InfoRow label="متاح" value={user.driverProfile.available ? "نعم" : "لا"} /></div>)}
          {user.workerProfile && (<div className="glass rounded-xl p-3"><div className="text-xs font-bold mb-1">ملف الفني</div><InfoRow label="متاح" value={user.workerProfile.available ? "نعم" : "لا"} /></div>)}
          <div><div className="text-[11px] font-bold text-muted-foreground mb-1">المعاملات ({user.transactions?.length ?? 0})</div><div className="space-y-1 max-h-32 overflow-y-auto">{(user.transactions ?? []).map((tx: any) => (<div key={tx.id} className="text-[10px] flex justify-between glass rounded-lg px-2 py-1"><span>{tx.type === "credit" ? "+" : "-"}{Number(tx.amount).toLocaleString()} د.ع</span><span className="text-muted-foreground">{new Date(tx.created_at).toLocaleDateString("ar-IQ")}</span></div>))}</div></div>
          <div><div className="text-[11px] font-bold text-muted-foreground mb-1">الطلبات ({user.requests?.length ?? 0})</div><div className="space-y-1 max-h-32 overflow-y-auto">{(user.requests ?? []).map((r: any) => (<div key={r.id} className="text-[10px] flex justify-between glass rounded-lg px-2 py-1"><span>{r.type === "taxi" ? "🚕" : "🛠️"} {r.status}</span><span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-IQ")}</span></div>))}</div></div>
        </div>
      </div>
    </div>
  );
}

function BlockModal({ target, onConfirm, onClose }: any) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("permanent");
  function getExpiry(): string | null { if (duration === "permanent") return null; const now = new Date(); switch (duration) { case "1h": now.setHours(now.getHours() + 1); break; case "24h": now.setDate(now.getDate() + 1); break; case "7d": now.setDate(now.getDate() + 7); break; case "30d": now.setDate(now.getDate() + 30); break; } return now.toISOString(); }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="glass rounded-3xl p-5 w-full max-w-md">
        <h3 className="font-black mb-2">حظر المستخدم</h3>
        <p className="text-xs text-muted-foreground mb-4">{target.name}</p>
        <div className="space-y-3">
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full glass rounded-xl px-4 py-2.5 text-sm">
            <option value="permanent">حظر دائم</option><option value="1h">ساعة واحدة</option><option value="24h">٢٤ ساعة</option><option value="7d">٧ أيام</option><option value="30d">٣٠ يوم</option>
          </select>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب..." className="w-full glass rounded-xl px-4 py-2.5 text-sm" rows={2} />
          <div className="flex gap-2"><button onClick={() => onConfirm(target.id, reason, getExpiry())} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold">تأكيد الحظر</button><button onClick={onClose} className="px-4 py-2.5 rounded-xl glass text-sm font-bold">إلغاء</button></div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) { return (<div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-bold">{value ?? "—"}</span></div>); }

function ProvidersSection() {
  const [type, setType] = useState("driver");
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const listProviders = useServerFn(adminListProviders);
  const setStatus = useServerFn(adminSetProviderStatus);
  const load = useCallback(async () => { setLoading(true); try { setProviders(await listProviders({ data: { type } })); } catch (e) {} finally { setLoading(false); } }, [type]);
  useEffect(() => { load(); }, [load]);
  async function handleAction(userId: string, status: string) { try { await setStatus({ data: { user_id: userId, type, status } }); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة السائقين والفنيين</h2>
      <div className="flex gap-1 mb-4 glass rounded-2xl p-1">{["driver", "worker"].map((t) => (<button key={t} onClick={() => setType(t)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t === "driver" ? "السائقون" : "الفنيون"}</button>))}</div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : providers.length === 0 ? <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">لا يوجد مزودون</div> : (
        <div className="space-y-2">{providers.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2"><div><div className="font-bold text-sm">{p.profiles?.full_name ?? "—"}</div><div className="text-[10px] text-muted-foreground">{p.profiles?.phone ?? "—"}</div></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.available ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{p.available ? "متاح" : "غير متاح"}</span></div>
            {type === "driver" && p.vehicle_make && <div className="text-[10px] text-muted-foreground mb-2">{p.vehicle_make} {p.vehicle_model} · {p.vehicle_plate}</div>}
            <div className="flex gap-1.5"><button onClick={() => handleAction(p.user_id, "approved")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">تفعيل</button><button onClick={() => handleAction(p.user_id, "suspended")} className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-bold">تعليق</button><button onClick={() => handleAction(p.user_id, "rejected")} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">رفض</button></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function RequestsSection() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const listRequests = useServerFn(adminListRequests);
  const cancelRequest = useServerFn(adminCancelRequest);
  const reopenRequest = useServerFn(adminReopenRequest);
  const load = useCallback(async () => { setLoading(true); try { setRequests(await listRequests({ data: { status: statusFilter } })); } catch (e) {} finally { setLoading(false); } }, [statusFilter]);
  useEffect(() => { load(); }, [load]);
  async function handleCancel(id: string) { try { await cancelRequest({ data: { request_id: id } }); load(); } catch (e) {} }
  async function handleReopen(id: string) { try { await reopenRequest({ data: { request_id: id } }); load(); } catch (e) {} }
  const statusLabels: Record<string, string> = { pending: "بانتظار", searching: "بحث", accepted: "مقبول", in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغي" };
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة الطلبات</h2>
      <div className="flex gap-1 mb-4 glass rounded-2xl p-1 overflow-x-auto">{["all", "pending", "searching", "accepted", "in_progress", "completed", "cancelled"].map((s) => (<button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{s === "all" ? "الكل" : statusLabels[s] ?? s}</button>))}</div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : requests.length === 0 ? <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">لا توجد طلبات</div> : (
        <div className="space-y-2">{requests.map((r) => (
          <div key={r.id} className="glass rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1"><div className="font-bold text-sm">{r.type === "taxi" ? "🚕 سيارة" : "🛠️ خدمة"}</div><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{statusLabels[r.status] ?? r.status}</span></div>
            <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-IQ")}</div>
            {r.pickup_text && <div className="text-xs mt-1">📍 {r.pickup_text}</div>}
            {r.dest_text && <div className="text-xs">🎯 {r.dest_text}</div>}
            {r.price_estimate && <div className="text-xs font-black mt-1">{Number(r.price_estimate).toLocaleString()} د.ع</div>}
            <div className="flex gap-1.5 mt-2">{r.status !== "cancelled" && r.status !== "completed" && <button onClick={() => handleCancel(r.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">إلغاء</button>}{r.status === "cancelled" && <button onClick={() => handleReopen(r.id)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">إعادة فتح</button>}</div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function ChatSection() {
  const [tab, setTab] = useState("chats");
  const [chats, setChats] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const listChats = useServerFn(adminListChats);
  const listMessages = useServerFn(adminListMessages);
  const deleteMessage = useServerFn(adminDeleteMessage);
  const load = useCallback(async () => { setLoading(true); try { if (tab === "chats") setChats(await listChats({ data: {} })); else setMessages(await listMessages({ data: {} })); } catch (e) {} finally { setLoading(false); } }, [tab]);
  useEffect(() => { load(); }, [load]);
  async function handleDelete(id: string) { try { await deleteMessage({ data: { message_id: id } }); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة الدردشة</h2>
      <div className="flex gap-1 mb-4 glass rounded-2xl p-1">{["chats", "messages"].map((t) => (<button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t === "chats" ? "المحادثات" : "الرسائل"}</button>))}</div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : tab === "chats" ? (chats.length === 0 ? <EmptyState text="لا توجد محادثات" /> : <div className="space-y-2">{chats.map((c) => (<div key={c.id} className="glass rounded-2xl p-3 text-sm"><div className="font-bold">{c.participant1?.full_name ?? "—"} ↔ {c.participant2?.full_name ?? "—"}</div><div className="text-[10px] text-muted-foreground">{new Date(c.updated_at ?? c.created_at).toLocaleString("ar-IQ")}</div></div>))}</div>) : (messages.length === 0 ? <EmptyState text="لا توجد رسائل" /> : <div className="space-y-2">{messages.map((m) => (<div key={m.id} className="glass rounded-2xl p-3 text-sm"><div className="flex justify-between items-start mb-1"><div className="font-bold text-xs">{m.sender?.full_name ?? "—"}</div><button onClick={() => handleDelete(m.id)} className="text-xs px-2 py-1 rounded-lg bg-red-100 text-red-700 font-bold">حذف</button></div><div className="text-xs text-muted-foreground">{m.body ?? m.content ?? "—"}</div><div className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString("ar-IQ")}</div></div>))}</div>)}
    </div>
  );
}

function FriendsSection() {
  const [tab, setTab] = useState("friends");
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const listFriends = useServerFn(adminListFriends);
  const listFriendRequests = useServerFn(adminListFriendRequests);
  const deleteFriendship = useServerFn(adminDeleteFriendship);
  const deleteRequest = useServerFn(adminDeleteFriendRequest);
  const load = useCallback(async () => { setLoading(true); try { if (tab === "friends") setFriends(await listFriends({ data: {} })); else setRequests(await listFriendRequests({ data: {} })); } catch (e) {} finally { setLoading(false); } }, [tab]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة الأصدقاء</h2>
      <div className="flex gap-1 mb-4 glass rounded-2xl p-1">{["friends", "requests"].map((t) => (<button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t === "friends" ? "الصداقات" : "طلبات الصداقة"}</button>))}</div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : tab === "friends" ? (friends.length === 0 ? <EmptyState text="لا توجد صداقات" /> : <div className="space-y-2">{friends.map((f) => (<div key={f.id} className="glass rounded-2xl p-3 flex items-center justify-between"><div className="text-sm"><div className="font-bold">{f.user?.full_name ?? "—"} ↔ {f.friend?.full_name ?? "—"}</div><div className="text-[10px] text-muted-foreground">{new Date(f.created_at).toLocaleDateString("ar-IQ")}</div></div><button onClick={async () => { try { await deleteFriendship({ data: { user1_id: f.user_id, user2_id: f.friend_id } }); load(); } catch (e) {} }} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">حذف</button></div>))}</div>) : (requests.length === 0 ? <EmptyState text="لا توجد طلبات" /> : <div className="space-y-2">{requests.map((r) => (<div key={r.id} className="glass rounded-2xl p-3 flex items-center justify-between"><div className="text-sm"><div className="font-bold">{r.sender?.full_name ?? "—"} → {r.receiver?.full_name ?? "—"}</div><div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-IQ")}</div></div><button onClick={async () => { try { await deleteRequest({ data: { request_id: r.id } }); load(); } catch (e) {} }} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">حذف</button></div>))}</div>)}
    </div>
  );
}

function ReportsSection() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const listReports = useServerFn(adminListReports);
  const resolveReport = useServerFn(adminResolveReport);
  const load = useCallback(async () => { setLoading(true); try { setReports(await listReports({ data: { status: statusFilter } })); } catch (e) {} finally { setLoading(false); } }, [statusFilter]);
  useEffect(() => { load(); }, [load]);
  async function handleResolve(id: string, status: string, note?: string) { try { await resolveReport({ data: { report_id: id, status: status as any, note } }); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة البلاغات</h2>
      <div className="flex gap-1 mb-4 glass rounded-2xl p-1">{["all", "pending", "resolved", "closed", "dismissed"].map((s) => (<button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-bold ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{s === "all" ? "الكل" : s === "pending" ? "معلقة" : s === "resolved" ? "محلولة" : s === "closed" ? "مغلقة" : "مرفوضة"}</button>))}</div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : reports.length === 0 ? <EmptyState text="لا توجد بلاغات" /> : (
        <div className="space-y-2">{reports.map((r) => (
          <div key={r.id} className="glass rounded-2xl p-3">
            <div className="flex justify-between mb-1"><span className="font-bold text-sm">{r.reason}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === "pending" ? "bg-amber-100 text-amber-700" : r.status === "resolved" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{r.status}</span></div>
            {r.details && <div className="text-xs text-muted-foreground mb-1">{r.details}</div>}
            <div className="text-[10px] text-muted-foreground">من: {r.reporter?.full_name ?? "—"} · ضد: {r.reported?.full_name ?? "—"}</div>
            {r.status === "pending" && <div className="flex gap-1.5 mt-2"><button onClick={() => handleResolve(r.id, "resolved")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">حل</button><button onClick={() => handleResolve(r.id, "closed")} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold">إغلاق</button><button onClick={() => handleResolve(r.id, "dismissed")} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">رفض</button></div>}
          </div>
        ))}</div>
      )}
    </div>
  );
}

function SubscriptionsSection() {
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة الاشتراكات</h2>
      <Link to="/admin/subscriptions" className="glass rounded-2xl p-5 flex items-center justify-between border-2 border-amber-500/20">
        <div className="flex items-center gap-3"><Crown className="h-6 w-6 text-amber-500" /><div><div className="font-black text-sm">نظام الاشتراكات والباقات</div><div className="text-xs text-muted-foreground">إدارة الباقات، المشتركين، والإعدادات</div></div></div>
        <ChevronLeft className="h-5 w-5 text-muted-foreground" />
      </Link>
    </div>
  );
}

function CouponsSection() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const listCoupons = useServerFn(adminListCoupons);
  const saveCoupon = useServerFn(adminSaveCoupon);
  const deleteCoupon = useServerFn(adminDeleteCoupon);
  const load = useCallback(async () => { setLoading(true); try { setCoupons(await listCoupons()); } catch (e) {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  async function handleSave(data: any) { try { await saveCoupon({ data }); setShowModal(false); load(); } catch (e) {} }
  async function handleDelete(id: string) { try { await deleteCoupon({ data: { coupon_id: id } }); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة الكوبونات</h2>
      <button onClick={() => { setEditing(null); setShowModal(true); }} className="w-full glass rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-bold text-primary border-2 border-dashed border-primary/30 mb-4">+ إضافة كوبون</button>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : coupons.length === 0 ? <EmptyState text="لا توجد كوبونات" /> : (
        <div className="space-y-2">{coupons.map((c) => (
          <div key={c.id} className={`glass rounded-2xl p-3 ${!c.active ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between mb-1"><div className="font-black text-sm font-mono">{c.code}</div><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{c.active ? "مفعّل" : "متوقف"}</span></div>
            <div className="text-xs text-muted-foreground">{c.type === "percentage" ? `${c.value}%` : `${Number(c.value).toLocaleString()} د.ع`} · استخدام {c.used_count}/{c.max_uses}{c.expires_at && ` · ينتهي ${new Date(c.expires_at).toLocaleDateString("ar-IQ")}`}</div>
            <div className="flex gap-1.5 mt-2"><button onClick={() => { setEditing(c); setShowModal(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold">تعديل</button><button onClick={() => handleDelete(c.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">حذف</button></div>
          </div>
        ))}</div>
      )}
      {showModal && <CouponModal coupon={editing} onSave={handleSave} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function CouponModal({ coupon, onSave, onClose }: any) {
  const [form, setForm] = useState({ id: coupon?.id, code: coupon?.code ?? "", type: coupon?.type ?? "percentage", value: coupon?.value ?? 10, max_uses: coupon?.max_uses ?? 1000, expires_at: coupon?.expires_at ?? null, active: coupon?.active ?? true, min_amount: coupon?.min_amount ?? 0 });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="glass rounded-3xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-black mb-4">{coupon ? "تعديل كوبون" : "إضافة كوبون"}</h3>
        <div className="space-y-3">
          <div><div className="text-[11px] font-bold text-muted-foreground mb-1">الكود</div><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full glass rounded-xl px-4 py-2.5 text-sm font-mono" /></div>
          <div className="grid grid-cols-2 gap-3"><div><div className="text-[11px] font-bold text-muted-foreground mb-1">النوع</div><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full glass rounded-xl px-4 py-2.5 text-sm"><option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></div><div><div className="text-[11px] font-bold text-muted-foreground mb-1">القيمة</div><input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className="w-full glass rounded-xl px-4 py-2.5 text-sm" /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><div className="text-[11px] font-bold text-muted-foreground mb-1">الحد الأقصى للاستخدام</div><input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })} className="w-full glass rounded-xl px-4 py-2.5 text-sm" /></div><div><div className="text-[11px] font-bold text-muted-foreground mb-1">الحد الأدنى للمبلغ</div><input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })} className="w-full glass rounded-xl px-4 py-2.5 text-sm" /></div></div>
          <div><div className="text-[11px] font-bold text-muted-foreground mb-1">تاريخ الانتهاء (اختياري)</div><input type="datetime-local" onChange={(e) => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full glass rounded-xl px-4 py-2.5 text-sm" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> مفعّل</label>
          <div className="flex gap-2"><button onClick={() => onSave(form)} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">حفظ</button><button onClick={onClose} className="px-4 py-2.5 rounded-xl glass text-sm font-bold">إلغاء</button></div>
        </div>
      </div>
    </div>
  );
}

function WalletSection() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState(false);
  const listTx = useServerFn(adminListTransactions);
  const adjustWallet = useServerFn(adminAdjustWallet);
  const load = useCallback(async () => { setLoading(true); try { setTransactions(await listTx({ data: {} })); } catch (e) {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  async function handleAdjust(userId: string, amount: number, type: string, note: string) { try { await adjustWallet({ data: { user_id: userId, amount, type, note } }); setAdjustModal(false); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة المحفظة</h2>
      <button onClick={() => setAdjustModal(true)} className="w-full glass rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-bold text-primary border-2 border-dashed border-primary/30 mb-4">+ تعديل رصيد</button>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : transactions.length === 0 ? <EmptyState text="لا توجد معاملات" /> : (
        <div className="space-y-2">{transactions.map((tx) => (
          <div key={tx.id} className="glass rounded-2xl p-3 text-sm"><div className="flex justify-between mb-1"><span className="font-bold">{tx.profiles?.full_name ?? "—"}</span><span className={`font-black ${tx.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>{tx.type === "credit" ? "+" : "-"}{Number(tx.amount).toLocaleString()} د.ع</span></div><div className="text-[10px] text-muted-foreground">{new Date(tx.created_at).toLocaleString("ar-IQ")}</div>{tx.note && <div className="text-xs text-muted-foreground mt-1">{tx.note}</div>}</div>
        ))}</div>
      )}
      {adjustModal && <WalletAdjustModal onConfirm={handleAdjust} onClose={() => setAdjustModal(false)} />}
    </div>
  );
}

function WalletAdjustModal({ onConfirm, onClose }: any) {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState(0);
  const [type, setType] = useState("credit");
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="glass rounded-3xl p-5 w-full max-w-md">
        <h3 className="font-black mb-4">تعديل رصيد</h3>
        <div className="space-y-3">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="معرف المستخدم (UUID)" className="w-full glass rounded-xl px-4 py-2.5 text-sm" />
          <div className="grid grid-cols-2 gap-3"><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="المبلغ" className="glass rounded-xl px-4 py-2.5 text-sm" /><select value={type} onChange={(e) => setType(e.target.value)} className="glass rounded-xl px-4 py-2.5 text-sm"><option value="credit">إضافة (Credit)</option><option value="debit">خصم (Debit)</option></select></div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة" className="w-full glass rounded-xl px-4 py-2.5 text-sm" />
          <div className="flex gap-2"><button onClick={() => onConfirm(userId, amount, type, note)} disabled={!userId || amount === 0} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50">تنفيذ</button><button onClick={onClose} className="px-4 py-2.5 rounded-xl glass text-sm font-bold">إلغاء</button></div>
        </div>
      </div>
    </div>
  );
}

function MapSection() {
  const [locations, setLocations] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const getLocations = useServerFn(adminGetLiveLocations);
  const getRequests = useServerFn(adminGetLiveRequests);
  useEffect(() => { (async () => { try { const [l, r] = await Promise.all([getLocations(), getRequests()]); setLocations(l); setRequests(r); } catch (e) {} finally { setLoading(false); } })(); }, []);
  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;
  return (
    <div>
      <h2 className="text-xl font-black mb-4">الخريطة المباشرة</h2>
      <div className="grid grid-cols-2 gap-3 mb-4"><div className="glass rounded-2xl p-4"><Car className="h-5 w-5 text-emerald-600 mb-2" /><div className="text-2xl font-black">{locations.length}</div><div className="text-[10px] text-muted-foreground font-bold">مزودون متاحون</div></div><div className="glass rounded-2xl p-4"><ListChecks className="h-5 w-5 text-amber-500 mb-2" /><div className="text-2xl font-black">{requests.length}</div><div className="text-[10px] text-muted-foreground font-bold">طلبات نشطة</div></div></div>
      <h3 className="font-black text-sm mb-2">مواقع المزودين</h3>
      <div className="space-y-2 mb-4">{locations.length === 0 ? <EmptyState text="لا توجد مواقع" /> : locations.map((l) => (<div key={l.user_id} className="glass rounded-2xl p-3 text-sm"><div className="font-bold">{l.profile?.full_name ?? "—"}</div><div className="text-[10px] text-muted-foreground">{Number(l.latitude ?? l.lat ?? 0).toFixed(4)}, {Number(l.longitude ?? l.lng ?? 0).toFixed(4)}</div></div>))}</div>
      <h3 className="font-black text-sm mb-2">الطلبات النشطة</h3>
      <div className="space-y-2">{requests.length === 0 ? <EmptyState text="لا توجد طلبات نشطة" /> : requests.map((r) => (<div key={r.id} className="glass rounded-2xl p-3 text-sm"><div className="font-bold">{r.type === "taxi" ? "🚕" : "🛠️"} {r.pickup_text ?? "—"}</div><div className="text-[10px] text-muted-foreground">{r.status}</div></div>))}</div>
    </div>
  );
}

function NotificationsSection() {
  const [target, setTarget] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const broadcast = useServerFn(adminBroadcastNotification);
  async function handleSend() { setSending(true); try { const r = await broadcast({ data: { target, title, body, user_id: target === "single" ? userId : undefined } }); setSentCount(r.sent); setTitle(""); setBody(""); setUserId(""); } catch (e) {} finally { setSending(false); } }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">الإشعارات</h2>
      {sentCount !== null && <div className="glass rounded-2xl p-3 mb-4 text-sm text-emerald-600 font-bold">تم إرسال الإشعار إلى {sentCount} مستخدم</div>}
      <div className="space-y-3">
        <div><div className="text-[11px] font-bold text-muted-foreground mb-1">الهدف</div><select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full glass rounded-xl px-4 py-2.5 text-sm"><option value="all">جميع المستخدمين</option><option value="drivers">السائقون فقط</option><option value="workers">الفنيون فقط</option><option value="single">مستخدم محدد</option></select></div>
        {target === "single" && <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="معرف المستخدم (UUID)" className="w-full glass rounded-xl px-4 py-2.5 text-sm" />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الإشعار" className="w-full glass rounded-xl px-4 py-2.5 text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="نص الإشعار" className="w-full glass rounded-xl px-4 py-2.5 text-sm" rows={3} />
        <button onClick={handleSend} disabled={sending || !title || !body} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50">{sending ? "جاري الإرسال..." : "إرسال"}</button>
      </div>
    </div>
  );
}

function RolesSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleModal, setRoleModal] = useState<any | null>(null);
  const listUsers = useServerFn(adminListUsers);
  const searchUsers = useServerFn(adminSearchUsers);
  const grantRole = useServerFn(adminGrantRole);
  const revokeRole = useServerFn(adminRevokeRole);
  const load = useCallback(async () => { setLoading(true); try { if (searchQuery.trim()) setUsers(await searchUsers({ data: { query: searchQuery.trim() } })); else { const d = await listUsers({ data: { page: 1, limit: 50 } }); setUsers(d.users); } } catch (e) {} finally { setLoading(false); } }, [searchQuery]);
  useEffect(() => { load(); }, [load]);
  async function handleGrant(userId: string, role: string) { try { await grantRole({ data: { target_user_id: userId, role } }); setRoleModal(null); load(); } catch (e) {} }
  async function handleRevoke(userId: string, role: string) { try { await revokeRole({ data: { target_user_id: userId, role } }); load(); } catch (e) {} }
  return (
    <div>
      <h2 className="text-xl font-black mb-4">إدارة الصلاحيات</h2>
      <div className="flex gap-2 mb-4"><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث عن مستخدم..." className="flex-1 glass rounded-xl px-4 py-2.5 text-sm outline-none" /><button onClick={load} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">بحث</button></div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : <div className="space-y-2">{users.map((u) => (<div key={u.id} className="glass rounded-2xl p-3"><div className="flex items-center justify-between mb-2"><div><div className="font-bold text-sm">{u.full_name || "—"}</div><div className="text-[10px] text-muted-foreground">{u.phone}</div></div><button onClick={() => setRoleModal(u)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold">إدارة</button></div></div>))}</div>}
      {roleModal && <RoleModal user={roleModal} onGrant={handleGrant} onRevoke={handleRevoke} onClose={() => setRoleModal(null)} />}
    </div>
  );
}

function RoleModal({ user, onGrant, onRevoke, onClose }: any) {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const { supabase } = await import("@/integrations/supabase/client"); const { data } = await (supabase as any).from("user_roles").select("role").eq("user_id", user.id); setRoles((data ?? []).map((r: any) => r.role)); } catch (e) {} finally { setLoading(false); } })(); }, [user.id]);
  const staffRoles = ["admin", "support", "finance", "moderator"];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="glass rounded-3xl p-5 w-full max-w-md">
        <div className="flex justify-between items-center mb-4"><h3 className="font-black">صلاحيات: {user.full_name}</h3><button onClick={onClose} className="text-muted-foreground">✕</button></div>
        {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
          <div className="space-y-2">{staffRoles.map((role) => { const has = roles.includes(role); return (<div key={role} className="glass rounded-xl p-3 flex items-center justify-between"><span className="text-sm font-bold capitalize">{role}</span>{has ? <button onClick={() => onRevoke(user.id, role)} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold">إزالة</button> : <button onClick={() => onGrant(user.id, role)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">تعيين</button>}</div>); })}{roles.includes("super_admin") && <div className="glass rounded-xl p-3 border border-amber-500/30"><div className="text-sm font-bold text-amber-600">Super Admin (لا يمكن إزالته)</div></div>}</div>
        )}
      </div>
    </div>
  );
}

function AuditSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const listLogs = useServerFn(adminListAuditLogs);
  useEffect(() => { (async () => { try { setLogs(await listLogs({ data: {} })); } catch (e) {} finally { setLoading(false); } })(); }, []);
  const actionLabels: Record<string, string> = { grant_role: "منح صلاحية", revoke_role: "إزالة صلاحية", block_user: "حظر مستخدم", unblock_user: "رفع حظر", set_provider_status: "تغيير حالة مزود", cancel_request: "إلغاء طلب", reopen_request: "إعادة فتح طلب", adjust_wallet: "تعديل محفظة", broadcast_notification: "إرسال إشعار", create_coupon: "إنشاء كوبون", update_coupon: "تعديل كوبون", delete_coupon: "حذف كوبون", resolve_report: "حل بلاغ", delete_friendship: "حذف صداقة", delete_friend_request: "حذف طلب صداقة", delete_message: "حذف رسالة", bootstrap_first_super_admin: "إنشاء مدير أعلى" };
  return (
    <div>
      <h2 className="text-xl font-black mb-4">سجل العمليات</h2>
      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : logs.length === 0 ? <EmptyState text="لا توجد عمليات مسجلة" /> : (
        <div className="space-y-2">{logs.map((l) => (<div key={l.id} className="glass rounded-2xl p-3 text-sm"><div className="flex justify-between mb-1"><span className="font-bold">{actionLabels[l.action] ?? l.action}</span><span className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString("ar-IQ")}</span></div><div className="text-[10px] text-muted-foreground">بواسطة: {l.admin?.full_name ?? l.user_id?.slice(0, 8) ?? "—"}</div>{l.metadata && <div className="text-[10px] text-muted-foreground mt-1">{Object.entries(l.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}</div>))}</div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) { return (<div className="glass rounded-2xl p-8 text-center"><div className="text-sm text-muted-foreground">{text}</div></div>); }
