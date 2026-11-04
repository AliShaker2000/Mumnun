import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { sendPasswordReset } from "@/lib/auth.functions";
import { isValidPhone, normalizePhone } from "@/lib/phone";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "استعادة كلمة المرور | ممنون" },
    { name: "description", content: "استعد الوصول إلى حساب ممنون باستخدام الهاتف أو البريد الإلكتروني." },
    { property: "og:title", content: "استعادة كلمة المرور | ممنون" },
    { property: "og:description", content: "استعد الوصول إلى حساب ممنون باستخدام الهاتف أو البريد الإلكتروني." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const reset = useServerFn(sendPasswordReset);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) {
      toast.error("أدخل رقم الهاتف أو البريد الإلكتروني");
      return;
    }
    const isEmail = value.includes("@");
    if (!isEmail && !isValidPhone(value)) {
      toast.error("رقم هاتف غير صالح");
      return;
    }
    const finalId = isEmail ? value : normalizePhone(value);
    setBusy(true);
    try {
      const res = await reset({
        data: {
          identifier: finalId,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      setSent(true);
      if (!res.hasEmail) {
        toast.info(
          "لا يوجد بريد إلكتروني مسجّل لهذا الحساب. تواصل مع الدعم لإعادة التعيين.",
        );
      } else {
        toast.success("تم إرسال رابط الاستعادة إلى بريدك");
      }
    } catch (err: any) {
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-14 pb-8 flex flex-col">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-3xl bg-gradient-to-br from-primary to-primary-glow glow-primary mb-4 shadow-elegant">
          <ShieldCheck className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-black">استعادة كلمة المرور</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          أدخل رقم هاتفك أو بريدك ونرسل لك رابط إعادة التعيين
        </p>
      </div>

      <div className="glass rounded-3xl p-6 shadow-card flex-1 flex flex-col">
        {sent ? (
          <div className="text-center flex-1 flex flex-col items-center justify-center gap-4">
            <Mail className="h-12 w-12 text-primary" />
            <p className="text-sm">
              إذا كان لهذا الحساب بريد مسجّل، فقد أرسلنا له رابط الاستعادة.
              راجع بريدك (بما فيه مجلد البريد المهمل).
            </p>
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="mt-4 w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold btn-press"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 flex-1 flex flex-col">
            <label className="block">
              <div className="text-xs font-bold text-muted-foreground mb-2">
                رقم الهاتف أو البريد الإلكتروني
              </div>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="07XXXXXXXXX أو you@example.com"
                dir="ltr"
                className="w-full bg-input border border-border text-foreground px-4 py-3.5 rounded-2xl text-sm font-semibold outline-none focus:border-ring focus:ring-4 focus:ring-ring text-left"
              />
            </label>

            <div className="flex-1" />

            <button
              type="submit"
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold btn-press glow-primary shadow-elegant disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              إرسال رابط الاستعادة
              <ArrowRight className="h-5 w-5" />
            </button>

            <Link
              to="/auth"
              className="text-center text-sm text-muted-foreground hover:text-foreground"
            >
              العودة لتسجيل الدخول
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
