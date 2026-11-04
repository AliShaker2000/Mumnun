import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { checkSuperAdminExists, bootstrapSuperAdmin } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Crown, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/bootstrap")({ ssr: false,
  head: () => ({ meta: [
    { title: "الإعداد الأولي | ممنون" },
    { name: "description", content: "إعداد إدارة منصة ممنون." },
    { property: "og:title", content: "الإعداد الأولي | ممنون" },
    { property: "og:description", content: "إعداد إدارة منصة ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: BootstrapPage });

function BootstrapPage() {
  const { session, loading } = useAuth();
  const [exists, setExists] = useState<boolean | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const checkExists = useServerFn(checkSuperAdminExists);
  const bootstrap = useServerFn(bootstrapSuperAdmin);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try { const result = await checkExists(); setExists(result.exists); }
      catch (e) { setExists(false); }
    })();
  }, [session]);

  if (loading || !session) return <Navigate to="/auth" />;
  if (exists === null) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (exists) {
    return (
      <div className="min-h-screen grid place-items-center px-5">
        <div className="text-center max-w-md">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-black mb-2">يوجد مدير أعلى بالفعل</h1>
          <p className="text-sm text-muted-foreground mb-4">تم إنشاء أول مدير أعلى (Super Admin) مسبقاً. لا يمكن إنشاء أكثر من واحد.</p>
          <Link to="/admin" className="inline-block px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">الذهاب للوحة الإدارة</Link>
        </div>
      </div>
    );
  }

  async function handleBootstrap() {
    setBootstrapping(true);
    try { await bootstrap(); toast.success("تم إنشاء المدير الأعلى بنجاح"); setTimeout(() => window.location.href = "/admin", 1500); }
    catch (e: any) { toast.error(e.message ?? "فشل إنشاء المدير الأعلى"); }
    finally { setBootstrapping(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center px-5">
      <div className="text-center max-w-md">
        <Crown className="h-16 w-16 text-amber-500 mx-auto mb-4" />
        <h1 className="text-xl font-black mb-2">إنشاء أول مدير أعلى</h1>
        <p className="text-sm text-muted-foreground mb-2">لا يوجد مدير أعلى بعد. اضغط الزر أدناه لمنح نفسك صلاحية Super Admin.</p>
        <div className="glass rounded-2xl p-4 mb-4 text-right">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>هذه العملية متاحة مرة واحدة فقط. بعد إنشاء المدير الأعلى، لا يمكن لأي مستخدم إنشاء مدير أعلى آخر أو منح نفسه صلاحيات.</span>
          </div>
        </div>
        <button onClick={handleBootstrap} disabled={bootstrapping} className="w-full py-3.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {bootstrapping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crown className="h-5 w-5" />}
          منحي صلاحية Super Admin
        </button>
      </div>
    </div>
  );
}
