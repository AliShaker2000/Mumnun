import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/mobile-shell";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/history")({ ssr: false,
  head: () => ({ meta: [
    { title: "سجل الطلبات | ممنون" },
    { name: "description", content: "تابع طلبات النقل والخدمات السابقة والنشطة في ممنون." },
    { property: "og:title", content: "سجل الطلبات | ممنون" },
    { property: "og:description", content: "تابع طلبات النقل والخدمات السابقة والنشطة في ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: HistoryPage });

function HistoryPage() {
  const { session, loading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<"all" | "active" | "done">("all");

  useEffect(() => {
    if (!session) return;
    supabase
      .from("service_requests")
      .select("id, type, status, price_estimate, pickup_text, dest_text, created_at")
      .or(`customer_id.eq.${session.user.id},provider_id.eq.${session.user.id}`)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setItems(data ?? []));
  }, [session]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  const filtered = items.filter((r) =>
    tab === "all" ? true : tab === "active" ? ["pending", "searching", "accepted", "in_progress"].includes(r.status) : r.status === "completed"
  );

  return (
    <MobileShell>
      <div className="px-5 pt-10">
        <h1 className="text-3xl font-black mb-4">سجل الطلبات</h1>

        <div className="flex gap-2 mb-4">
          {(["all", "active", "done"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-bold btn-press ${tab === t ? "bg-primary text-primary-foreground" : "glass"}`}
            >
              {t === "all" ? "الكل" : t === "active" ? "نشطة" : "منجزة"}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
            لا توجد طلبات بعد
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <Link key={r.id} to="/request/$id" params={{ id: r.id }} className="glass rounded-2xl p-4 flex items-center gap-3 btn-press">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center text-lg">
                  {r.type === "taxi" ? "🚕" : "🛠️"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{r.pickup_text || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.status === "pending" ? "بانتظار" : r.status === "searching" ? "بحث" : r.status === "accepted" ? "مقبول" : r.status === "in_progress" ? "قيد التنفيذ" : r.status === "completed" ? "مكتمل" : r.status === "cancelled" ? "ملغي" : r.status}
                  </div>
                </div>
                {r.price_estimate && (
                  <div className="text-left">
                    <div className="font-black text-sm">{Number(r.price_estimate).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">د.ع</div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
