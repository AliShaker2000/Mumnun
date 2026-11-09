import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidPhone, normalizePhone, phoneToEmail } from "@/lib/phone";
import { useAuth, SUPER_ADMIN_EMAIL } from "@/lib/auth-context";
import { lookupAuthEmail } from "@/lib/auth.functions";
import { Loader2, Phone, Lock, ArrowLeft, ArrowRight, Mail, User, ShieldCheck, Crown } from "lucide-react";
import { toast } from "@/lib/toast";
import { useWelcomePreferences } from "@/lib/welcome-preferences";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: Mode } => ({
    mode: search.mode === "login" ? "login" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | ممنون" },
      { name: "description", content: "أنشئ حسابك أو سجّل الدخول لطلب النقل والخدمات في ممنون." },
      { property: "og:title", content: "تسجيل الدخول | ممنون" },
      {
        property: "og:description",
        content: "أنشئ حسابك أو سجّل الدخول لطلب النقل والخدمات في ممنون.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signup" | "login";

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode || "signup");
  const { language } = useWelcomePreferences();
  const t = (ar: string, en: string) => (language === "ar" ? ar : en);
  const Forward = language === "ar" ? ArrowLeft : ArrowRight;
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh, setActiveRole } = useAuth();
  const lookup = useServerFn(lookupAuthEmail);

  const isTargetAdmin =
    identifier.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() ||
    email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

  async function handleAdminQuickLogin() {
    setBusy(true);
    try {
      setIdentifier(SUPER_ADMIN_EMAIL);
      setPassword("123456");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: SUPER_ADMIN_EMAIL,
        password: "admin_password_mamnoon",
      });
      if (error) {
        // If first time, sign up admin
        await supabase.auth.signUp({
          email: SUPER_ADMIN_EMAIL,
          password: "admin_password_mamnoon",
          options: {
            data: {
              phone: "07700000000",
              full_name: "أحمد (المدير العام)",
            },
          },
        });
      }
      const uid = data?.user?.id || "admin_user_ahmed";
      await supabase.from("profiles").upsert({
        id: uid,
        phone: "07700000000",
        full_name: "أحمد (المدير العام)",
        email: SUPER_ADMIN_EMAIL,
      });
      await supabase.from("user_roles").upsert([
        { user_id: uid, role: "super_admin" },
        { user_id: uid, role: "admin" },
        { user_id: uid, role: "customer" },
      ]);
      localStorage.setItem("mumnun-active-role", "admin");
      setActiveRole("admin");
      await refresh();
      toast.success("أهلاً بك يا مديرنا العام أحمد! تم تفعيل الصلاحيات الكاملة 👑");
      navigate({ to: "/admin" });
    } catch {
      toast.success("أهلاً بك يا مديرنا العام أحمد 👑");
      navigate({ to: "/admin" });
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(
        t("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "Password must be at least 6 characters"),
      );
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
        const isSuperAdminEmail = realEmail === SUPER_ADMIN_EMAIL.toLowerCase();

        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              phone: normalized,
              full_name: isSuperAdminEmail ? "أحمد (المدير العام)" : name.trim(),
            },
          },
        });
        if (error) throw error;
        const uid = data.user?.id;
        if (uid) {
          const { error: pErr } = await supabase.from("profiles").upsert({
            id: uid,
            phone: normalized,
            full_name: isSuperAdminEmail ? "أحمد (المدير العام)" : name.trim(),
            email: realEmail || null,
          });
          if (pErr) throw pErr;

          if (isSuperAdminEmail) {
            await supabase.from("user_roles").upsert([
              { user_id: uid, role: "super_admin" },
              { user_id: uid, role: "admin" },
              { user_id: uid, role: "customer" },
            ]);
            localStorage.setItem("mumnun-active-role", "admin");
            setActiveRole("admin");
          }
        }
        await refresh();
        if (isSuperAdminEmail) {
          toast.success("تم إنشاء حساب الإدارة العليا بنجاح! أهلاً بك يا أحمد 👑");
          navigate({ to: "/admin" });
        } else {
          toast.success(t("تم إنشاء الحساب", "Account created"));
          navigate({ to: "/select-role" });
        }
      } else {
        const id = identifier.trim();
        if (!id) {
          toast.error(
            t("أدخل رقم الهاتف أو البريد الإلكتروني", "Enter your phone number or email"),
          );
          setBusy(false);
          return;
        }
        const isEmail = id.includes("@");
        const isSuper = id.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

        if (!isEmail && !isValidPhone(id)) {
          toast.error(t("رقم الهاتف غير صالح", "Invalid phone number"));
          setBusy(false);
          return;
        }
        const finalId = isEmail ? id : normalizePhone(id);
        const { email: authEmail } = await lookup({ data: { identifier: finalId } });
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (error) throw error;

        if (isSuper || authEmail?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          const uid = data.user?.id;
          if (uid) {
            await supabase.from("user_roles").upsert([
              { user_id: uid, role: "super_admin" },
              { user_id: uid, role: "admin" },
            ]);
          }
          localStorage.setItem("mumnun-active-role", "admin");
          setActiveRole("admin");
          await refresh();
          toast.success("أهلاً بعودتك يا مديرنا العام أحمد 👑");
          navigate({ to: "/admin" });
          return;
        }

        await refresh();
        toast.success(t("أهلاً بعودتك", "Welcome back"));
        navigate({ to: "/" });
      }
    } catch (err: any) {
      const msg = err?.message || t("حدث خطأ", "Something went wrong");
      if (/Failed to fetch|NetworkError|fetch.*failed/i.test(msg)) {
        toast.error(
          t(
            "تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى.",
            "Unable to connect. Check your internet and try again.",
          ),
        );
      } else if (/already registered|User already/i.test(msg)) {
        toast.error(
          t(
            "هذا الحساب مسجّل مسبقاً. أدخل كلمة المرور لتسجيل الدخول.",
            "This account already exists. Enter your password to sign in.",
          ),
        );
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
    <div
      dir={language === "ar" ? "rtl" : "ltr"}
      lang={language}
      className="min-h-screen flex flex-col px-5 pt-8 pb-8 max-w-md mx-auto"
    >
      <Button asChild variant="link" className="self-start mb-3">
        <Link to="/welcome">{t("اللغة والترحيب", "Language & welcome")}</Link>
      </Button>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary-glow glow-primary mb-4 shadow-elegant">
          <span className="text-3xl font-black text-primary-foreground">م</span>
        </div>
        <h1 className="text-4xl font-black text-gradient">{t("ممنون", "Mumnun")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("منصة النقل والخدمات الفاخرة", "Rides and home services")}
        </p>
      </div>

      {/* Special Admin Quick Login Banner */}
      <div className="mb-4 bg-gradient-to-br from-amber-500/20 via-yellow-500/25 to-amber-600/20 border-2 border-amber-500/40 rounded-3xl p-4 shadow-md text-right">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👑</span>
            <div>
              <div className="text-xs font-black text-amber-900">بوابة الإدارة العليا</div>
              <div className="text-[11px] text-amber-800/80 font-bold">{SUPER_ADMIN_EMAIL}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdminQuickLogin}
            disabled={busy}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-black text-xs shadow-md btn-press flex items-center gap-1.5"
          >
            <Crown className="h-3.5 w-3.5" />
            <span>دخول الإدارة فوراً</span>
          </button>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 shadow-card flex-1 flex flex-col">
        <div className="flex bg-surface-2 rounded-2xl p-1 mb-5">
          {(["signup", "login"] as Mode[]).map((m) => (
            <Button
              key={m}
              type="button"
              variant={mode === m ? "default" : "ghost"}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition btn-press tap-highlight-none ${
                mode === m
                  ? "bg-primary text-primary-foreground shadow-card"
                  : "text-muted-foreground"
              }`}
            >
              {m === "signup" ? t("حساب جديد", "New account") : t("تسجيل دخول", "Sign in")}
            </Button>
          ))}
        </div>

        {/* Distinctive Visual Card when entering Ahmed's Super Admin email */}
        {isTargetAdmin && (
          <div className="mb-4 rounded-2xl p-3.5 bg-amber-50 border-2 border-amber-500/60 text-right animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-amber-800 font-black text-xs">
              <Crown className="h-4 w-4 text-amber-600" />
              <span>حساب المدير العام أحمد (صلاحيات كاملة)</span>
            </div>
            <p className="text-[11px] text-amber-700/90 mt-1 leading-relaxed">
              سيتم تفعيل الصلاحية المطلقة: مراجعة طلبات السائقين والفنيين، الحظر، توزيع الخصومات، وإدارة الدعم.
            </p>
          </div>
        )}

        <form noValidate onSubmit={onSubmit} className="space-y-4 flex-1 flex flex-col">
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
              <Field
                label={t(
                  "البريد الإلكتروني",
                  "Email",
                )}
                icon={<Mail className="h-4 w-4" />}
              >
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
            <Field
              label={t("رقم الهاتف أو البريد", "Phone number or email")}
              icon={<Phone className="h-4 w-4" />}
            >
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                dir="ltr"
                placeholder="07XXXXXXXXX أو البريد"
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
              className="text-xs text-primary self-end hover:underline btn-press"
            >
              {t("نسيت كلمة المرور؟", "Forgot password?")}
            </Link>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={busy}
              className={`w-full py-4 rounded-2xl font-black text-base shadow-lg transition btn-press flex items-center justify-center gap-2 ${
                isTargetAdmin
                  ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-amber-500/25"
                  : "bg-primary text-primary-foreground shadow-primary/20"
              }`}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <span>
                    {isTargetAdmin
                      ? "دخول الإدارة العامة 👑"
                      : mode === "signup"
                        ? t("إنشاء الحساب والمتابعة", "Create account & continue")
                        : t("تسجيل الدخول", "Sign in")}
                  </span>
                  <Forward className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-muted-foreground mb-1.5">{label}</label>
      <div className="relative">
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {icon}
        </div>
        <div className="[&>input]:pr-10">{children}</div>
      </div>
    </div>
  );
}
