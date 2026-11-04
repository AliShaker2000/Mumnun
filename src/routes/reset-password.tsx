import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "كلمة مرور جديدة | ممنون" },
    { name: "description", content: "عيّن كلمة مرور جديدة لحساب ممنون." },
    { property: "og:title", content: "كلمة مرور جديدة | ممنون" },
    { property: "og:description", content: "عيّن كلمة مرور جديدة لحساب ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Recovery flow: Supabase redirects with #access_token=...&type=recovery
  // and the JS client picks it up automatically into a session.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also check current session in case the event already fired.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("تم تحديث كلمة المرور");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "تعذّر تحديث كلمة المرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-14 pb-8 flex flex-col">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-3xl bg-gradient-to-br from-primary to-primary-glow glow-primary mb-4 shadow-elegant">
          <Lock className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-black">كلمة مرور جديدة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          اختر كلمة مرور قوية لحسابك
        </p>
      </div>

      <div className="glass rounded-3xl p-6 shadow-card flex-1 flex flex-col">
        {!ready ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 flex-1 flex flex-col">
            <Field label="كلمة المرور الجديدة">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full bg-input border border-border text-foreground px-4 py-3.5 rounded-2xl text-sm font-semibold outline-none focus:border-ring focus:ring-4 focus:ring-ring"
              />
            </Field>
            <Field label="تأكيد كلمة المرور">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••"
                className="w-full bg-input border border-border text-foreground px-4 py-3.5 rounded-2xl text-sm font-semibold outline-none focus:border-ring focus:ring-4 focus:ring-ring"
              />
            </Field>
            <div className="flex-1" />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary shadow-elegant disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              حفظ كلمة المرور
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-muted-foreground mb-2">{label}</div>
      {children}
    </label>
  );
}
