import { useAuth, SUPER_ADMIN_EMAIL } from "@/lib/auth-context";
import { AlertOctagon, Mail, LogOut, Clock, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function BanOverlay() {
  const { banStatus, signOut, session } = useAuth();

  if (!session || !banStatus?.isBanned) return null;

  const expiresText = banStatus.expiresAt
    ? `حظر مؤقت ينتهي في: ${new Date(banStatus.expiresAt).toLocaleString("ar-IQ", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`
    : "حظر دائم بقرار من الإدارة العامة";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 text-foreground">
      <div className="glass-strong rounded-3xl p-6 max-w-md w-full border border-red-500/40 shadow-2xl text-center animate-pop-in">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="h-8 w-8 animate-pulse" />
        </div>

        <h2 className="text-xl font-black text-red-500 mb-1">تم تجميد وحظر هذا الحساب</h2>
        <p className="text-xs text-muted-foreground mb-4">
          تم إيقاف صلاحيات الحساب من قبل الإدارة العامة للمنصة
        </p>

        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-right space-y-2 mb-5">
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-muted-foreground">نوع ومدة الحظر: </span>
              <span className="font-black text-foreground">{expiresText}</span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <AlertOctagon className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-muted-foreground">سبب الحظر: </span>
              <span className="font-bold text-foreground">
                {banStatus.reason || "مخالفة معايير الاستخدام أو إساءة استخدام المنصة"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <Link
            to="/support"
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition"
          >
            <Mail className="h-4 w-4" />
            مراسلة الإدارة العامة والدعم ({SUPER_ADMIN_EMAIL})
          </Link>

          <a
            href={`mailto:${SUPER_ADMIN_EMAIL}?subject=طلب استئناف حظر حساب&body=مرحباً، أرجو مراجعة حظر حسابي المسجل في تطبيق ممنون.`}
            className="w-full py-2.5 rounded-xl glass hover:bg-surface-2 text-xs font-bold flex items-center justify-center gap-1.5 transition text-muted-foreground"
          >
            إرسال بريد مباشر للمدير العام
          </a>

          <button
            onClick={() => signOut()}
            className="w-full py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
}
