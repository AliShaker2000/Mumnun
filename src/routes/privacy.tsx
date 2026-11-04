import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ ssr: false,
  head: () => ({ meta: [
    { title: "سياسة الخصوصية | ممنون" },
    { name: "description", content: "تعرّف على استخدام بياناتك وحماية خصوصيتك في ممنون." },
    { property: "og:title", content: "سياسة الخصوصية | ممنون" },
    { property: "og:description", content: "تعرّف على استخدام بياناتك وحماية خصوصيتك في ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: PrivacyPage });

function PrivacyPage() {
  return (
    <div className="min-h-screen px-5 pt-10 pb-20 max-w-2xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-black mb-6">سياسة الخصوصية</h1>
      <div className="glass rounded-3xl p-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-black text-foreground mb-2">مقدمة</h2>
          <p>تطبيق "ممنون" منصة لنقل الأشخاص وطلب الخدمات المنزلية. نحن نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">البيانات التي نجمعها</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>الاسم الكامل ورقم الهاتف والبريد الإلكتروني عند إنشاء الحساب</li>
            <li>الموقع الجغرافي عند استخدام خدمة الطلب (لإيجاد أقرب مزود خدمة)</li>
            <li>سجل الطلبات والمعاملات المالية داخل التطبيق</li>
            <li>بيانات الجهاز لأغراض الأمان ومنع الاحتيال</li>
          </ul>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">كيف نستخدم بياناتك</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>توصيل الخدمات المطلوبة (سيارة أو فني)</li>
            <li>تحسين تجربة المستخدم وجودة الخدمة</li>
            <li>التواصل معك بخصوص طلباتك وحسابك</li>
            <li>ضمان أمان المنصة ومنع الاستخدام غير المصرّح به</li>
          </ul>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">مشاركة البيانات</h2>
          <p>لا نبيع بياناتك لأطراف ثالثة. قد نشاركها مع مزودي الخدمة (السائقين والفنيين) فقط لإتمام الطلب، أو عند الطلب القانوني من الجهات المختصة.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">حماية البيانات</h2>
          <p>نستخدم تشفير SSL/TLS لجميع الاتصالات، ونخزّن كلمات المرور بشكل مشفّر. لا يمكن لأحد رؤية كلمة مرورك.</p>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">حقوقك</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>الوصول إلى بياناتك الشخصية</li>
            <li>طلب تعديل أو حذف بياناتك</li>
            <li>إلغاء حسابك في أي وقت</li>
          </ul>
        </section>
        <section>
          <h2 className="font-black text-foreground mb-2">التواصل</h2>
          <p>لأي استفسار بخصوص الخصوصية، تواصل معنا عبر صفحة الدعم داخل التطبيق.</p>
        </section>
        <section>
          <p className="text-xs text-muted-foreground/60">آخر تحديث: يوليو ٢٠٢٦</p>
        </section>
      </div>
    </div>
  );
}
