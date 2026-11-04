import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error }: any) => {
        if (error) console.warn("[notifications] fetch error:", error.message);
        setItems(data ?? []);
      });

    const ch = supabase
      .channel(`notif-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (payload: any) => {
          const n = payload.new as Notif;
          setItems((cur) => [n, ...cur]);
          toast(n.title, { description: n.body ?? undefined });
          try {
            new Audio(
              "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
            )
              .play()
              .catch(() => {});
          } catch {}
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markAll() {
    if (!uid) return;
    const { error } = await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", uid)
      .is("read_at", null);
    if (error) { toast.error("تعذّر تعليم الإشعارات"); return; }
    setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  if (!uid) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative h-10 w-10 rounded-full bg-card border border-border grid place-items-center btn-press"
        aria-label="الإشعارات"
      >
        <Bell className="h-5 w-5 text-foreground" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute top-0 right-0 left-0 bg-background rounded-b-3xl p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-lg">الإشعارات</h2>
              {unread > 0 && (
                <button
                  onClick={markAll}
                  className="text-xs font-bold text-primary inline-flex items-center gap-1"
                >
                  <Check className="h-3 w-3" /> تعليم الكل
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">لا توجد إشعارات</div>
            ) : (
              <ul className="space-y-2">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`rounded-2xl border border-border p-3 ${!n.read_at ? "bg-primary/5" : "bg-card"}`}
                  >
                    {n.link && n.link.startsWith("/") ? (
                      <Link to={n.link as any} onClick={() => setOpen(false)} className="block">
                        <div className="font-bold text-sm">{n.title}</div>
                        {n.body && <div className="text-xs text-muted-foreground mt-1">{n.body}</div>}
                      </Link>
                    ) : (
                      <>
                        <div className="font-bold text-sm">{n.title}</div>
                        {n.body && <div className="text-xs text-muted-foreground mt-1">{n.body}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
