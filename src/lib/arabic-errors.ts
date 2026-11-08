const knownErrors: Array<[RegExp, string]> = [
  [
    /active_request_exists|active request/i,
    "لديك طلب نشط بالفعل؛ أكمله أو ألغِه قبل إنشاء طلب جديد",
  ],
  [
    /weak_password|password.*(weak|pwned|breach)|weak.*password/i,
    "كلمة المرور ضعيفة أو مكشوفة؛ اختر كلمة مرور أقوى",
  ],
  [/password.*(least|short|characters)|Password must/i, "كلمة المرور يجب أن تكون ٦ أحرف على الأقل"],
  [
    /Invalid login|Invalid credentials|Incorrect sign-in/i,
    "رقم الهاتف أو البريد الإلكتروني أو كلمة المرور غير صحيحة",
  ],
  [
    /already registered|User already|account already exists/i,
    "هذا الحساب مسجّل مسبقاً؛ سجّل الدخول بكلمة المرور",
  ],
  [
    /rate.limit|too many requests|try again in a minute/i,
    "محاولات كثيرة؛ انتظر دقيقة ثم أعد المحاولة",
  ],
  [
    /failed to fetch|network|unable to connect|fetch.*failed/i,
    "تعذّر الاتصال؛ تحقق من الإنترنت وأعد المحاولة",
  ],
  [/user_blocked/i, "حسابك موقوف؛ تواصل مع الإدارة"],
  [/request_unavailable|offer_expired/i, "انتهت مهلة الطلب أو قبله سائق آخر أو ألغاه الزبون"],
  [/request_not_found|Request not found|Offer not found/i, "الطلب غير موجود أو لم يعد متاحاً"],
  [/unauthorized|jwt.*expired|not authenticated/i, "انتهت جلسة الدخول؛ سجّل الدخول مرة أخرى"],
  [/forbidden|permission denied/i, "ليس لديك صلاحية لتنفيذ هذه العملية"],
  [/email.*not confirmed/i, "يرجى تأكيد البريد الإلكتروني قبل تسجيل الدخول"],
  [/invalid.*email|email.*invalid/i, "البريد الإلكتروني غير صالح"],
  [/invalid phone/i, "رقم الهاتف غير صالح"],
  [/enter your full name/i, "الرجاء إدخال الاسم الكامل"],
  [/enter your phone number or email/i, "أدخل رقم الهاتف أو البريد الإلكتروني"],
  [
    /API_KEY_HTTP_REFERRER_BLOCKED|referrer-restricted|مقيّد بالمواقع/i,
    "تعذّرت خدمة الخرائط بسبب تقييد مفتاح الخدمة؛ يجب على الإدارة تصحيح الإعدادات",
  ],
  [
    /API_KEY_SERVICE_BLOCKED|فعّل Places/i,
    "خدمة البحث أو حساب الطريق غير مفعّلة؛ يجب على الإدارة تفعيل خدمات الخرائط",
  ],
];

export function arabicWarning(value: unknown): string {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const known = knownErrors.find(([pattern]) => pattern.test(message));
  if (known) return known[1];
  // Retain safe Arabic copy only. Never expose raw provider/database identifiers.
  if (/[\u0600-\u06ff]/.test(message) && !/[a-zA-Z]/.test(message)) return message;
  return "تعذّر تنفيذ العملية؛ أعد المحاولة أو تواصل مع الإدارة";
}
