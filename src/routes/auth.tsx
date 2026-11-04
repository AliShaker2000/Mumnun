import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidPhone, normalizePhone, phoneToEmail } from "@/lib/phone";
import { useAuth } from "@/lib/auth-context";
import { lookupAuthEmail } from "@/lib/auth.functions";
import { Loader2, Phone, Lock, ArrowLeft, ArrowRight, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { useWelcomePreferences } from "@/lib/welcome-preferences";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: Mode } => ({ mode: search.mode === "login" ? "login" : undefined }),
  head: () => ({ meta: [
    { title: "تسجيل الدخول | ممنون" },
    { name: "description", content: "أنشئ حسابك أو سجّل الدخول لطلب النقل والخدمات في ممنون." },
    { property: "og:title", content: "تسجيل الدخول | ممنون" },
    { property: "og:description", content: "أنشئ حسابك أو سجّل الدخول لطلب النقل والخدمات في ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

type Mode = "signup" | "login";

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode || "signup");
  const { language } = useWelcomePreferences();
  const t = (ar: string, en: string) => language === "ar" ? ar : en;
  const Forward = language === "ar" ? ArrowLeft : ArrowRight;
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const lookup = useServerFn(lookupAuthEmail);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "Password must be at least 6 characters"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        if (name.trim().length < 2) {
          toast.error(t("الرجاء إدخال الاسم", "Please enter your full name"));
          setBusy(false);
          return;
        }
        if (!isValidPhone(phone)) {
          toast.error(t("رقم الهاتف غير صالح", "Invalid phone number"));
          setBusy(false);
          return;
        }
        const normalized = normalizePhone(phone);
        const realEmail = email.trim().toLowerCase();
        const authEmail = realEmail || phoneToEmail(normalized);
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              phone: normalized,
              full_name: name.trim(),
            },
          },
        });
        if (error) throw error;
        const uid = data.user?.id;
        if (uid) {
          const { error: pErr } = await supabase.from("profiles").upsert({
            id: uid,
            phone: normalized,
            full_name: name.trim(),
            email: realEmail || null,
          });
          if (pErr) throw pErr;
        }
        await refresh();
        toast.success(t("تم إنشاء الحساب", "Account created"));
        navigate({ to: "/select-role" });
      } else {
        const id = identifier.trim();
        if (!id) {
          toast.error(t("أدخل رقم الهاتف أو البريد الإلكتروني", "Enter your phone number or email"));
          setBusy(false);
          return;
        }
        const isEmail = id.includes("@");
        if (!isEmail && !isValidPhone(id)) {
          toast.error(t("رقم الهاتف غير صالح", "Invalid phone number"));
          setBusy(false);
          return;
        }
        const finalId = isEmail ? id : normalizePhone(id);
        const { email: authEmail } = await lookup({ data: { identifier: finalId } });
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (error) throw error;
        await refresh();
        toast.success(t("أهلاً بعودتك", "Welcome back"));
        navigate({ to: "/" });
      }
    } catch (err: any) {
      const msg = err?.message || t("حدث خطأ", "Something went wrong");
      if (/Failed to fetch|NetworkError|fetch.*failed/i.test(msg)) {
        toast.error(t("تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى.", "Unable to connect. Check your internet and try again."));
      } else if (/already registered|User already/i.test(msg)) {
        toast.error(t("هذا الحساب مسجّل مسبقاً. أدخل كلمة المرور لتسجيل الدخول.", "This account already exists. Enter your password to sign in."));
        setIdentifier(phone || email);
        setMode("login");
      } else if (/Invalid login|Invalid credentials/i.test(msg)) {
        toast.error(t("بيانات الدخول غير صحيحة", "Incorrect sign-in details"));
      } else if (/Email rate limit/i.test(msg)) {
        toast.error(t("الرجاء المحاولة بعد دقيقة", "Please try again in a minute"));
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={language === "ar" ? "rtl" : "ltr"} lang={language} className="min-h-screen flex flex-col px-5 pt-8 pb-8">
      <Button asChild variant="link" className="self-start mb-3"><Link to="/welcome">{t("اللغة والترحيب", "Language & welcome")}</Link></Button>
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary-glow glow-primary mb-5 shadow-elegant">
          <span className="text-3xl font-black text-primary-foreground">م</span>
        </div>
        <h1 className="text-4xl font-black text-gradient">{t("ممنون", "Mumnun")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("منصة النقل والخدمات الفاخرة", "Rides and home services")}</p>
      </div>

      <div className="glass rounded-3xl p-6 shadow-card flex-1 flex flex-col">
        <div className="flex bg-surface-2 rounded-2xl p-1 mb-6">
          {(["signup", "login"] as Mode[]).map((m) => (
            <Button
              key={m}
              type="button"
              variant={mode === m ? "default" : "ghost"}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition btn-press tap-highlight-none ${
                mode === m ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {m === "signup" ? t("حساب جديد", "New account") : t("تسجيل دخول", "Sign in")}
            </Button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4 flex-1 flex flex-col">
          {mode === "signup" ? (
            <>
              <Field label={t("الاسم الكامل", "Full name")} icon={<User className="h-4 w-4" />}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("مثال: أحمد محمد", "e.g. Ahmed Mohammed")}
                  className="input-base"
                />
              </Field>
              <Field label={t("رقم الهاتف", "Phone number")} icon={<Phone className="h-4 w-4" />}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  placeholder="07XXXXXXXXX"
                  inputMode="tel"
                  className="input-base text-left"
                />
              </Field>
              <Field label={t("البريد الإلكتروني (لاستعادة كلمة المرور)", "Email (for password recovery)")} icon={<Mail className="h-4 w-4" />}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  placeholder="you@example.com"
                  inputMode="email"
                  className="input-base text-left"
                />
              </Field>
            </>
          ) : (
            <Field label={t("رقم الهاتف أو البريد", "Phone number or email")} icon={<Phone className="h-4 w-4" />}>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                dir="ltr"
                placeholder="07XXXXXXXXX"
                className="input-base text-left"
              />
            </Field>
          )}

          <Field label={t("كلمة المرور", "Password")} icon={<Lock className="h-4 w-4" />}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="input-base"
            />
          </Field>

          {mode === "login" && (
            <Link
              to="/forgot-password"
              className="text-xs text-primary font-bold hover:underline self-start"
            >
              {t("نسيت كلمة المرور؟", "Forgot password?")}
            </Link>
          )}

          <div className="flex-1" />

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-14 py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-base btn-press glow-primary shadow-elegant disabled:opacity-60 tap-highlight-none flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            {mode === "signup" ? t("إنشاء الحساب", "Create account") : t("دخول", "Sign in")}
            <Forward className="h-5 w-5" />
          </Button>

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            {t("بمتابعتك أنت توافق على الشروط والأحكام وسياسة الخصوصية.", "By continuing, you agree to the terms and privacy policy.")}
          </p>
        </form>
      </div>

      <style>{`
        .input-base {
          width: 100%;
          background: var(--color-input);
          border: 1px solid var(--color-border);
          color: var(--color-foreground);
          padding: 14px 16px;
          border-radius: 1rem;
          font-size: 15px;
          font-weight: 600;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input-base:focus { border-color: var(--color-ring); box-shadow: 0 0 0 4px var(--color-ring); }
        .input-base::placeholder { color: var(--color-muted-foreground); font-weight: 500; }
      `}</style>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </label>
  );
}
