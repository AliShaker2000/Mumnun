import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Car, Wrench, User, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/select-role")({
  ssr: false,
  head: () => ({ meta: [
    { title: "نوع الحساب | ممنون" },
    { name: "description", content: "اختر حساب زبون أو كابتن أو فني في ممنون." },
    { property: "og:title", content: "نوع الحساب | ممنون" },
    { property: "og:description", content: "اختر حساب زبون أو كابتن أو فني في ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SelectRolePage,
});

const roles: { id: AppRole; title: string; desc: string; icon: any; gradient: string }[] = [
  { id: "customer", title: "زبون", desc: "اطلب تكسي أو خدمة منزلية بضغطة واحدة", icon: User, gradient: "from-blue-500 to-cyan-400" },
  { id: "driver", title: "كابتن تكسي", desc: "استقبل طلبات الرحلات واكسب يومياً", icon: Car, gradient: "from-amber-500 to-yellow-400" },
  { id: "worker", title: "فني خدمات", desc: "قدم خدمتك واستقبل طلبات في اختصاصك", icon: Wrench, gradient: "from-emerald-500 to-teal-400" },
];

function SelectRolePage() {
  const { session, refresh, loading } = useAuth();
  const [picked, setPicked] = useState<AppRole | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  async function confirm() {
    if (!picked || !session) return;
    setBusy(true);
    try {
      if (picked === "customer") {
        const { error } = await supabase.from("user_roles").insert({ user_id: session.user.id, role: "customer" });
        if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
        await refresh();
        navigate({ to: "/home" });
      } else if (picked === "driver") {
        navigate({ to: "/onboarding/driver" });
      } else {
        navigate({ to: "/onboarding/worker" });
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-12 pb-8 flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-black">اختر نوع حسابك</h1>
        <p className="text-sm text-muted-foreground mt-2">يمكنك إضافة أدوار أخرى لاحقاً من الإعدادات</p>
      </div>

      <div className="space-y-3 flex-1">
        {roles.map(({ id, title, desc, icon: Icon, gradient }) => {
          const active = picked === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPicked(id)}
              className={`w-full text-right glass rounded-3xl p-5 flex items-center gap-4 btn-press tap-highlight-none transition ${
                active ? "ring-2 ring-primary shadow-elegant glow-primary" : ""
              }`}
            >
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${gradient} grid place-items-center shadow-card`}>
                <Icon className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black">{title}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate">{desc}</div>
              </div>
              <div className={`h-6 w-6 rounded-full border-2 grid place-items-center ${active ? "border-primary bg-primary" : "border-border"}`}>
                {active && <div className="h-2.5 w-2.5 rounded-full bg-primary-foreground" />}
              </div>
            </button>
          );
        })}
      </div>

      <button
        disabled={!picked || busy}
        onClick={confirm}
        className="mt-6 w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-base btn-press glow-primary shadow-elegant disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        متابعة
        <ArrowLeft className="h-5 w-5" />
      </button>
    </div>
  );
}
