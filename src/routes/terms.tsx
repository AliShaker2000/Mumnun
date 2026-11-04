import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ ssr: false,
  head: () => ({ meta: [
    { title: "الشروط والأحكام | ممنون" },
    { name: "description", content: "اطلع على شروط استخدام منصة ممنون للنقل والخدمات." },
    { property: "og:title", content: "الشروط والأحكام | ممنون" },
    { property: "og:description", content: "اطلع على شروط استخدام منصة ممنون للنقل والخدمات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: TermsPage });

function TermsPage() {
  return (
    <div className="min-h-screen px-5 pt-10 pb-20 max-w-2xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-black mb-6">الشروط والأحكام</h1>
      <div className="glass rounded-3xl p-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-black text-foreground mb-2">قبول الشروط</h2>
          <p>باستخدامك تطبيق "ممنون"، فإنك توافق على هذه الشروط والأحكام. إذا لم توافق، يرجى عدم استخدام التطبيق.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">الخدمات</h2>
          <p>يوفر "ممنون" منصة لربط المستخدمين بمزودي الخدمات (سائقين وفنيين). التطبيق وسيط بين الأطراف ولا يتحمل مسؤولية جودة الخدمة المقدمة من طرف ثالث.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">الحساب</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>يجب تقديم معلومات صحيحة عند إنشاء الحساب</li>
            <li>أنت مسؤول عن الحفاظ على سرية كلمة المرور</li>
            <li>يُحظر إنشاء أكثر من حساب لكل شخص</li>
          </ul>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">المدفوعات</h2>
          <p>تُجرى المدفوعات داخل التطبيق عبر المحفظة الإلكترونية. جميع المعاملات مسجّلة وقابلة للمراجعة. العمولة تُخصم تلقائياً من مزود الخدمة.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">السلوك المقبول</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>يُحظر استخدام التطبيق لأغراض غير قانونية</li>
            <li>يُحظر إساءة المعاملة أو التحرش بأي مستخدم</li>
            <li>يُحظر التلاعب بالأسعار أو الطلبات الوهمية</li>
          </ul>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">الإلغاء</h2>
          <p>قد نُلغي أو نعلّق حسابك عند مخالفة هذه الشروط. يمكنك حذف حسابك في أي وقت من إعدادات الملف الشخصي.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">المسؤولية القانونية</h2>
          <p>التطبيق يقدم "كما هو" دون ضمانات صريحة أو ضمنية. لا نتحمل مسؤولية أي أضرار غير مباشرة ناتجة عن استخدام التطبيق.</p>
        </section>
        <section>
          <p className="text-xs text-muted-foreground/60">آخر تحديث: يوليو ٢٠٢٦</p>
        </section>
      </div>
    </div>
  );
}
