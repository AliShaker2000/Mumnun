import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth, SUPER_ADMIN_EMAIL } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Headphones, Plus, MessageSquare, Send, Mail, Crown, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/support")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الدعم الفني | ممنون" },
      { name: "description", content: "تواصل مع دعم ممنون بإشراف الإدارة العامة وتابع طلبات المساعدة." },
      { property: "og:title", content: "الدعم الفني | ممنون" },
      { property: "og:description", content: "تواصل مع دعم ممنون بإشراف الإدارة العامة وتابع طلبات المساعدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportCenter,
});

type Ticket = {
  id: string;
  user_id?: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  created_at: string;
  user?: { full_name?: string; phone?: string; email?: string };
};

type TicketMessage = {
  id: string;
  sender_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
};

function SupportCenter() {
  const { session, loading, isSuperAdmin } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [adminViewAll, setAdminViewAll] = useState(false);

  const supportScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = supportScrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length, selected?.id]);

  useEffect(() => {
    if (!session) return;
    loadTickets();
  }, [session, adminViewAll]);

  async function loadTickets() {
    setLoadingTickets(true);
    let query = (supabase as any).from("support_tickets").select("*");
    if (!adminViewAll || !isSuperAdmin) {
      query = query.eq("user_id", session!.user.id);
    }
    const { data } = await query.order("created_at", { ascending: false });
    setTickets(data ?? []);
    setLoadingTickets(false);
  }

  async function loadMessages(ticketId: string) {
    const { data } = await (supabase as any)
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at");
    setMessages(data ?? []);

    const ch = (supabase as any)
      .channel(`support-${ticketId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload: any) => {
          setMessages((prev) => [...prev, payload.new]);
        },
      )
      .subscribe();

    return () => {
      (supabase as any).removeChannel(ch);
    };
  }

  useEffect(() => {
    if (!selected) return;
    const cleanup = loadMessages(selected.id);
    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [selected]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function createTicket() {
    if (!newSubject.trim() || !newDesc.trim()) {
      toast.error("يرجى ملء عنوان وتفاصيل التذكرة");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .insert({
          user_id: session!.user.id,
          subject: newSubject.trim(),
          description: newDesc.trim(),
          category: newCategory,
          status: "open",
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      toast.success("تم إرسال تذكرتك إلى الإدارة العامة بنجاح ✓");
      setShowNew(false);
      setNewSubject("");
      setNewDesc("");
      loadTickets();
      if (data) setSelected(data);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء إرسال التذكرة");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setBusy(true);
    try {
      const isStaffReply = isSuperAdmin;
      const { error } = await (supabase as any).from("support_ticket_messages").insert({
        ticket_id: selected.id,
        sender_id: session!.user.id,
        message: reply.trim(),
        is_staff: isStaffReply,
      });
      if (error) throw error;
      setReply("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-primary-foreground shadow-md">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black">راسل الدعم الفني</h1>
            <p className="text-xs text-muted-foreground">خدمة عملاء ومساعدة فورية</p>
          </div>
        </div>
        <Link to="/" className="text-xs font-bold text-muted-foreground hover:text-foreground">
          الرئيسية
        </Link>
      </div>

      {/* Admin Information Card */}
      <div className="mb-5 rounded-3xl p-4 bg-gradient-to-br from-amber-500/15 via-yellow-500/15 to-primary/10 border-2 border-amber-500/35 shadow-sm text-right space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <span className="text-xs font-black text-amber-900">
              الدعم المباشر تحت إشراف الإدارة العامة
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
            المدير العام أحمد
          </span>
        </div>
        <p className="text-xs text-amber-900/80 leading-relaxed font-medium">
          يصل استفسارك وتذكرتك مباشرة إلى حساب الإدارة ({SUPER_ADMIN_EMAIL}) لضمان المتابعة وحل أي مشكلة تخص الرحلات أو الخدمات بأسرع وقت.
        </p>
        <div className="pt-1 flex flex-wrap gap-2">
          <a
            href={`mailto:${SUPER_ADMIN_EMAIL}?subject=استفسار تطبيق ممنون`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-border text-[11px] font-bold text-foreground shadow-sm hover:bg-muted btn-press"
          >
            <Mail className="h-3.5 w-3.5 text-primary" />
            <span>راسل الإدارة بالبريد: {SUPER_ADMIN_EMAIL}</span>
          </a>
          {isSuperAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-[11px] font-black shadow-sm btn-press"
            >
              <Crown className="h-3.5 w-3.5" />
              <span>لوحة الإدارة الكاملة</span>
            </Link>
          )}
        </div>
      </div>

      {/* If Super Admin, allow toggle to view all user tickets */}
      {isSuperAdmin && (
        <div className="mb-4 flex items-center justify-between glass p-2 rounded-2xl">
          <span className="text-xs font-bold text-foreground pr-2">
            وضع الإدارة: {adminViewAll ? "عرض تذاكر جميع المستخدمين" : "عرض تذاكري الشخصية"}
          </span>
          <button
            onClick={() => setAdminViewAll(!adminViewAll)}
            className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
          >
            {adminViewAll ? "تذاكري الخاصة" : "عرض جميع التذاكر"}
          </button>
        </div>
      )}

      {selected ? (
        <div>
          <button
            onClick={() => setSelected(null)}
            className="text-xs font-bold text-primary mb-3 flex items-center gap-1 btn-press"
          >
            ← العودة لجميع التذاكر
          </button>
          <div className="glass rounded-3xl p-5 mb-4 border border-border shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-black text-base text-foreground">{selected.subject}</h2>
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                  selected.status === "open"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {selected.status === "open" ? "مفتوحة ومتابعة" : "مغلقة"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{selected.description}</p>
            <div className="text-[10px] text-muted-foreground/70 mt-3 pt-2 border-t border-border/40">
              القسم: {selected.category} · تاريخ الإنشاء: {new Date(selected.created_at).toLocaleDateString("ar-IQ")}
            </div>
          </div>

          <div
            ref={supportScrollRef}
            className="space-y-3 mb-4 max-h-[400px] overflow-y-auto px-1 py-2"
          >
            {messages.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                لا توجد ردود بعد. اكتب ردك وسيتواصل معك فريق الإدارة فوراً.
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_id === session.user.id;
                return (
                  <div
                    key={m.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs shadow-sm leading-relaxed ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : m.is_staff
                            ? "bg-amber-500/15 border-2 border-amber-500/40 text-foreground rounded-bl-sm"
                            : "glass text-foreground rounded-bl-sm"
                      }`}
                    >
                      <div>{m.message}</div>
                      <div className="text-[9px] opacity-75 mt-1 flex items-center justify-between gap-3">
                        <span>{new Date(m.created_at).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}</span>
                        {m.is_staff && <span className="font-bold text-amber-700">👑 إدارة ممنون</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder={isSuperAdmin ? "اكتب رد الإدارة على المستخدم..." : "اكتب ردك للدعم..."}
              className="flex-1 glass rounded-2xl px-4 py-3 text-xs outline-none border border-border shadow-sm font-medium"
            />
            <button
              onClick={sendReply}
              disabled={busy || !reply.trim()}
              className="px-5 rounded-2xl bg-primary text-primary-foreground font-black text-xs btn-press disabled:opacity-50 flex items-center justify-center gap-1 shadow-md"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setShowNew(!showNew)}
            className="w-full glass rounded-3xl p-4 flex items-center justify-center gap-2 text-sm font-black text-primary border-2 border-dashed border-primary/40 mb-4 btn-press hover:bg-primary/5 transition"
          >
            <Plus className="h-4 w-4" /> فتح تذكرة دعم جديدة
          </button>

          {showNew && (
            <div className="glass rounded-3xl p-5 mb-5 space-y-3.5 border border-primary/30 shadow-card animate-in fade-in duration-200">
              <h3 className="text-sm font-black text-foreground">تذكرة مساعدة جديدة</h3>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">نوع الاستفسار</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full glass rounded-2xl px-4 py-3 text-xs font-bold outline-none border border-border"
                >
                  <option value="general">عام / استفسار</option>
                  <option value="taxi">رحلات التاكسي والسائقين</option>
                  <option value="technician">طلبات الفنيين والصيانة</option>
                  <option value="account">توثيق الحساب والقبول</option>
                  <option value="billing">الأسعار والخصومات</option>
                  <option value="complaint">شكوى أو بلاغ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">عنوان الموضوع</label>
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="مثال: استفسار حول رحلة أو تفعيل حساب"
                  className="w-full glass rounded-2xl px-4 py-3 text-xs outline-none border border-border font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">تفاصيل المشكلة أو الطلب</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="اكتب بالتفصيل ما الذي تحتاج المساعدة فيه..."
                  rows={3}
                  className="w-full glass rounded-2xl px-4 py-3 text-xs outline-none border border-border font-medium"
                />
              </div>
              <button
                onClick={createTicket}
                disabled={busy}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-sm btn-press disabled:opacity-50 shadow-md"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "إرسال التذكرة للإدارة ✓"}
              </button>
            </div>
          )}

          {loadingTickets ? (
            <div className="py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="glass rounded-3xl p-8 text-center space-y-2 border border-border/50">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <div className="text-sm font-bold text-foreground">لا توجد تذاكر دعم سابقة</div>
              <p className="text-xs text-muted-foreground">
                يمكنك الضغط على زر «فتح تذكرة دعم جديدة» أعلاه لمراسلة الإدارة والحصول على مساعدة سريعة.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="text-xs font-black text-muted-foreground px-1 mb-1">
                تذاكر المساعدة ({tickets.length})
              </div>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="w-full glass rounded-3xl p-4 text-right btn-press border border-border/50 hover:border-primary/40 transition block"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-black text-sm text-foreground">{t.subject}</div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        t.status === "open"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {t.status === "open" ? "مفتوحة" : "مغلقة"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-2">
                    القسم: {t.category} · {new Date(t.created_at).toLocaleDateString("ar-IQ")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
