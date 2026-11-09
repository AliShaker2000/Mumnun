import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  Loader2,
  ArrowLeft,
  Car,
  Check,
  Crown,
  Sparkles,
  Wallet,
  Camera,
  Upload,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { grantProviderRole } from "@/lib/roles.functions";
import {
  fileToCompressedDataUrl,
  saveProviderVerification,
  getProviderVerification,
} from "@/lib/verification";

export const Route = createFileRoute("/onboarding/driver")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الكابتن وتأكيد الهوية | ممنون" },
      {
        name: "description",
        content: "سجل بيانات سيارتك وأكد هويتك للانضمام إلى كباتن ممنون المعتمدين.",
      },
      { property: "og:title", content: "تسجيل الكابتن وتأكيد الهوية | ممنون" },
      {
        property: "og:description",
        content: "سجل بيانات سيارتك وأكد هويتك للانضمام إلى كباتن ممنون المعتمدين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingDriver,
});

type VehicleCategory = "economy" | "premium" | "luxury";

const POPULAR_MAKES = [
  "تويوتا",
  "هيونداي",
  "كيا",
  "نيسان",
  "شفروليه",
  "إم جي (MG)",
  "شيري",
  "رينو",
  "سايبا",
  "أخرى",
];

const SUGGESTED_MODELS: Record<string, string[]> = {
  تويوتا: ["كورولا", "كامري", "يارس", "راف فور (RAV4)", "أفالون"],
  هيونداي: ["النترا", "أكسنت", "سوناتا", "توسان", "كريتا"],
  كيا: ["سيراتو", "أوبتيما", "ريو", "سبورتاج", "بيكانتو"],
  نيسان: ["صني", "سنترا", "ألتيما", "إكس تريل"],
  شفروليه: ["كروز", "أوبترا", "ماليبو", "تاهو"],
  "إم جي (MG)": ["MG 5", "MG 6", "MG ZS", "MG GT"],
  شيري: ["أريزو 5", "تيجو 4", "تيجو 7", "أريزو 6"],
  رينو: ["لوغان", "داستر", "ميجان"],
  سايبا: ["سايبا 131", "تيبا", "كويك"],
};

const CATEGORY_META: Record<
  VehicleCategory,
  { label: string; emoji: string; gradient: string; desc: string }
> = {
  economy: {
    label: "ممنون اقتصادي",
    emoji: "🚗",
    gradient: "from-emerald-400 to-teal-500",
    desc: "سيارات موفرة وعملية للمشاوير اليومية",
  },
  premium: {
    label: "ممنون المتميز",
    emoji: "🚙",
    gradient: "from-sky-500 to-indigo-600",
    desc: "سيارات حديثة ومكيفة برحابة عالية",
  },
  luxury: {
    label: "ممنون فاخر",
    emoji: "🏎️",
    gradient: "from-amber-400 to-orange-500",
    desc: "أحدث الموديلات والفئات الراقية",
  },
};

function OnboardingDriver() {
  const { session, profile, loading, refresh } = useAuth();
  const navigate = useNavigate();

  // Car State
  const [make, setMake] = useState<string>("تويوتا");
  const [customMake, setCustomMake] = useState<string>("");
  const [modelName, setModelName] = useState<string>("كورولا");
  const [category, setCategory] = useState<VehicleCategory>("economy");
  const [year, setYear] = useState<string>(String(new Date().getFullYear() - 2));
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("أبيض");

  // Official Identity Verification State
  const [legalName, setLegalName] = useState(profile?.full_name || "");
  const [facePhoto, setFacePhoto] = useState<string | null>(profile?.avatar_url || null);
  const [idCardPhoto, setIdCardPhoto] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<"national_id" | "driver_license">("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [confirmedNameMatch, setConfirmedNameMatch] = useState(true);

  const [busy, setBusy] = useState(false);
  const [activeStep, setActiveStep] = useState<"car" | "identity">("car");

  const faceInputRef = useRef<HTMLInputElement>(null);
  const idCardInputRef = useRef<HTMLInputElement>(null);

  const [existingDoc, setExistingDoc] = useState<any>(null);
  const [editingMode, setEditingMode] = useState(false);

  // Load existing verification if stored
  useEffect(() => {
    if (session?.user?.id) {
      const existing = getProviderVerification(session.user.id);
      if (existing) {
        setExistingDoc(existing);
        if (existing.legalName) setLegalName(existing.legalName);
        if (existing.facePhotoUrl) setFacePhoto(existing.facePhotoUrl);
        if (existing.idCardPhotoUrl) setIdCardPhoto(existing.idCardPhotoUrl);
        if (existing.idNumber) setIdNumber(existing.idNumber);
        if (existing.vehicleMake) setMake(existing.vehicleMake);
        if (existing.vehicleModel) setModelName(existing.vehicleModel);
        if (existing.vehicleYear) setYear(String(existing.vehicleYear));
        if (existing.vehiclePlate) setPlate(existing.vehiclePlate);
        if (existing.vehicleColor) setColor(existing.vehicleColor);
        if (existing.vehicleCategory) setCategory(existing.vehicleCategory as any);
      }
    }
  }, [session?.user?.id]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  const finalMake = make === "أخرى" ? customMake.trim() : make;

  // Handle Photo Uploads
  async function handleFacePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 800, 800, 0.8);
      setFacePhoto(dataUrl);
      toast.success("تم التقاط صورة الوجه بنجاح ✓");
    } catch {
      toast.error("تعذر معالجة الصورة، يرجى المحاولة بصورة أخرى");
    }
  }

  async function handleIdCardChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 1200, 1200, 0.8);
      setIdCardPhoto(dataUrl);
      toast.success("تم إرفاق صورة الهوية بنجاح ✓");
    } catch {
      toast.error("تعذر معالجة صورة الهوية");
    }
  }

  async function submit() {
    if (!finalMake) {
      toast.error("اختر أو اكتب الشركة المصنعة للسيارة");
      setActiveStep("car");
      return;
    }
    if (!modelName.trim()) {
      toast.error("أدخل موديل السيارة");
      setActiveStep("car");
      return;
    }
    if (!plate.trim()) {
      toast.error("أدخل رقم لوحة السيارة");
      setActiveStep("car");
      return;
    }
    if (!legalName.trim() || legalName.trim().length < 5) {
      toast.error("يرجى كتابة الاسم الثلاثي الكامل المطابق للهوية الرسمية");
      setActiveStep("identity");
      return;
    }
    if (!facePhoto) {
      toast.error("يرجى إرفاق صورة شخصية حقيقية لوجهك");
      setActiveStep("identity");
      return;
    }
    if (!idCardPhoto) {
      toast.error("يرجى إرفاق صورة الهوية الأصلية (البطاقة الوطنية أو إجازة السوق)");
      setActiveStep("identity");
      return;
    }
    if (!confirmedNameMatch) {
      toast.error("يرجى تأكيد تطابق الاسم المكتوب مع الهوية المرفقة");
      return;
    }

    setBusy(true);
    try {
      const uid = session!.user.id;

      // 1. Update Profile with verified name & real face photo
      await supabase
        .from("profiles")
        .update({
          full_name: legalName.trim(),
          avatar_url: facePhoto,
        })
        .eq("id", uid);

      // 2. Save detailed verification document with pending status
      saveProviderVerification({
        userId: uid,
        role: "driver",
        legalName: legalName.trim(),
        phone: profile?.phone,
        email: profile?.email || session!.user.email,
        facePhotoUrl: facePhoto,
        idCardPhotoUrl: idCardPhoto,
        idNumber: idNumber.trim() || undefined,
        documentType,
        verifiedAt: new Date().toISOString(),
        status: "pending",
        vehicleMake: finalMake,
        vehicleModel: modelName.trim(),
        vehicleYear: Number(year) || undefined,
        vehiclePlate: plate.trim(),
        vehicleColor: color.trim() || undefined,
        vehicleCategory: category,
      });

      // 3. Upsert driver profile with car data and pending status
      const { error } = await supabase.from("driver_profiles").upsert({
        user_id: uid,
        vehicle_make: finalMake,
        vehicle_model: modelName.trim(),
        vehicle_year: Number(year) || null,
        vehicle_category: category,
        vehicle_plate: plate.trim(),
        vehicle_color: color.trim() || null,
        available: false,
        status: "pending",
      });

      if (error) throw error;

      setExistingDoc(getProviderVerification(uid));
      setEditingMode(false);
      await refresh();

      toast.success("تم إرسال طلبك بنجاح إلى الإدارة العليا (احمد) للمراجعة والتدقيق 📋");
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setBusy(false);
    }
  }

  const catMeta = CATEGORY_META[category];

  // If already submitted and not in editing mode, show Status Card
  if (existingDoc && !editingMode) {
    const isPending = existingDoc.status === "pending";
    const isApproved = existingDoc.status === "approved";
    const isRejected = existingDoc.status === "rejected";

    return (
      <div className="min-h-screen px-5 pt-12 pb-24 max-w-lg mx-auto">
        <div
          className={`glass rounded-3xl p-6 text-center space-y-4 border-2 ${
            isApproved
              ? "border-emerald-500/30"
              : isRejected
                ? "border-red-500/30"
                : "border-amber-500/30"
          }`}
        >
          <div
            className={`h-16 w-16 mx-auto rounded-3xl grid place-items-center text-3xl shadow-lg ${
              isApproved
                ? "bg-emerald-100 text-emerald-600"
                : isRejected
                  ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-600"
            }`}
          >
            {isApproved ? "✅" : isRejected ? "❌" : "⏳"}
          </div>

          <div>
            <h2 className="text-xl font-black text-foreground">
              {isApproved
                ? "تم قبول واعتماد حسابك ككابتن! 🚗"
                : isRejected
                  ? "تم رفض طلب التسجيل"
                  : "طلبك قيد المراجعة والتدقيق"}
            </h2>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {isApproved
                ? "تم تدقيق بيانات سيارتك وهويتك والموافقة عليها من قبل الإدارة العامة (احمد). يمكنك الآن العمل واستقبال الطلبات."
                : isRejected
                  ? existingDoc.rejectionReason ||
                    "تم فحص البيانات من قبل الإدارة العامة وتبيّن وجود نقص أو عدم تطابق في المستندات. يرجى تعديلها وإعادة الإرسال."
                  : "تم استلام بيانات سيارتك وهويتك بنجاح، ووصلت إلى حساب الإدارة العامة (احمد) للمراجعة والتحقق من صحتها."}
            </p>
          </div>

          <div className="bg-slate-50/80 rounded-2xl p-4 text-xs space-y-2 text-right font-medium">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الاسم المعتمد:</span>
              <span className="font-bold">{existingDoc.legalName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">السيارة:</span>
              <span className="font-bold">
                {existingDoc.vehicleMake} {existingDoc.vehicleModel} (
                {existingDoc.vehicleYear || "—"})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم اللوحة:</span>
              <span className="font-bold">{existingDoc.vehiclePlate || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">حالة الطلب:</span>
              <span
                className={`font-black ${
                  isApproved
                    ? "text-emerald-600"
                    : isRejected
                      ? "text-destructive"
                      : "text-amber-600"
                }`}
              >
                {isApproved
                  ? "مقبول ومعتمد ✓"
                  : isRejected
                    ? "مرفوض"
                    : "بانتظار قرار الإدارة ⏳"}
              </span>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            {isApproved ? (
              <button
                onClick={async () => {
                  await grantProviderRole({ data: { role: "driver" } });
                  localStorage.setItem("mumnun-active-role", "driver");
                  await refresh();
                  navigate({ to: "/home" });
                }}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm btn-press shadow-lg"
              >
                الانتقال إلى واجهة الكابتن 🚗
              </button>
            ) : (
              <button
                onClick={() => setEditingMode(true)}
                className="w-full py-3 rounded-2xl bg-surface border border-border text-foreground font-bold text-xs btn-press"
              >
                تعديل البيانات أو إعادة الرفع ✏️
              </button>
            )}

            <button
              onClick={() => navigate({ to: "/support" })}
              className="w-full py-3 rounded-2xl bg-primary/10 text-primary font-bold text-xs text-center btn-press"
            >
              راسل الدعم (a7md0555666@gmail.com) 💬
            </button>

            <button
              onClick={() => navigate({ to: "/" })}
              className="w-full py-2.5 text-xs text-muted-foreground font-bold"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-36 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 grid place-items-center shadow-lg text-white">
          <Car className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black">تسجيل الكابتن والسيارة</h1>
          <p className="text-xs text-muted-foreground">تحديد نوع السيارة وتأكيد الهوية الرسمية</p>
        </div>
      </div>

      {/* Step Switcher Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6">
        <button
          type="button"
          onClick={() => setActiveStep("car")}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all btn-press flex items-center justify-center gap-1.5 ${
            activeStep === "car"
              ? "bg-white text-primary shadow-md scale-[1.01]"
              : "text-muted-foreground hover:bg-slate-200/60"
          }`}
        >
          <Car className="h-4 w-4" />
          <span>١. بيانات السيارة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep("identity")}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all btn-press flex items-center justify-center gap-1.5 ${
            activeStep === "identity"
              ? "bg-white text-emerald-700 shadow-md scale-[1.01]"
              : "text-muted-foreground hover:bg-slate-200/60"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>٢. تأكيد الهوية والوجه</span>
          {facePhoto && idCardPhoto && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
        </button>
      </div>

      {/* STEP 1: CAR DETAILS */}
      {activeStep === "car" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Vehicle Category Card */}
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">
              اختر فئة سيارتك في التطبيق
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_META) as VehicleCategory[]).map((k) => {
                const c = CATEGORY_META[k];
                const active = category === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCategory(k)}
                    className={`p-3 rounded-2xl text-center btn-press transition-all border ${
                      active
                        ? "bg-white ring-2 ring-primary border-primary shadow-lg scale-105"
                        : "bg-white/80 border-border/60 hover:bg-white"
                    }`}
                  >
                    <div className="text-2xl mb-1">{c.emoji}</div>
                    <div className="font-black text-xs leading-tight">{c.label}</div>
                  </button>
                );
              })}
            </div>
            <div
              className={`mt-2.5 rounded-2xl p-3 bg-gradient-to-r ${catMeta.gradient} text-white shadow-sm text-xs`}
            >
              <div className="font-black text-sm mb-0.5">{catMeta.label}</div>
              <div className="text-[11px] opacity-90">{catMeta.desc}</div>
            </div>
          </div>

          {/* Quick Make Selection */}
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">
              الشركة المصنعة (الماركة)
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_MAKES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMake(m);
                    const firstSuggestion = SUGGESTED_MODELS[m]?.[0];
                    if (firstSuggestion) setModelName(firstSuggestion);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold btn-press transition ${
                    make === m
                      ? "bg-primary text-primary-foreground shadow"
                      : "bg-white border border-border/80 hover:bg-slate-50 text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {make === "أخرى" && (
              <input
                value={customMake}
                onChange={(e) => setCustomMake(e.target.value)}
                placeholder="اكتب ماركة سيارتك..."
                className="mt-2.5 w-full bg-white border border-border rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              />
            )}
          </div>

          {/* Model Name with Suggestions */}
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">
              موديل السيارة (الاسم)
            </div>
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="مثال: كورولا، النترا، سوناتا، سيراتو..."
              className="w-full bg-white border border-border rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-primary"
            />
            {SUGGESTED_MODELS[make] && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SUGGESTED_MODELS[make].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setModelName(s)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-medium text-foreground btn-press"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Year, Plate & Color */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1.5">سنة الصنع</div>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="2023"
                className="w-full bg-white border border-border rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              />
            </div>

            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1.5">لون السيارة</div>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="أبيض، رصاصي، أسود..."
                className="w-full bg-white border border-border rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1.5">
              رقم لوحة السيارة والمحافظة
            </div>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="مثال: 58214 بغداد خصوصي"
              className="w-full bg-white border border-border rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-primary"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (!plate.trim()) {
                toast.error("يرجى كتابة رقم اللوحة");
                return;
              }
              setActiveStep("identity");
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-black text-sm shadow-lg btn-press flex items-center justify-center gap-2"
          >
            <span>المتابعة لتأكيد الهوية والصورة</span>
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* STEP 2: OFFICIAL IDENTITY & FACE PHOTO VERIFICATION */}
      {activeStep === "identity" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-2.5">
            <ShieldCheck className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-sm">توثيق هوية الكابتن المعتمد</div>
              <div className="mt-0.5 leading-relaxed text-[11px] text-sky-800">
                لضمان أمان وسلامة الركاب، يجب أن يتطابق اسمك الكامل المكتوب مع اسمك في الهوية
                الرسمية، مع صورة واضحة لوجهك.
              </div>
            </div>
          </div>

          {/* Legal Full Name */}
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1.5">
              الاسم الكامل (مطابق للهوية الرسمية تماماً) *
            </div>
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="الاسم الثلاثي واللقب كما في الهوية..."
              className="w-full bg-white border border-border rounded-2xl px-4 py-3.5 text-sm font-black outline-none focus:border-primary shadow-sm"
            />
          </div>

          {/* Real Face Photo Capture */}
          <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                <span className="font-black text-sm">صورة الوجه الشخصية (تصوير حقيقي) *</span>
              </div>
              {facePhoto && (
                <span className="text-[11px] font-bold text-emerald-600">تم الإرفاق ✓</span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {facePhoto ? (
                <div className="relative h-20 w-20 rounded-2xl overflow-hidden border-2 border-primary shadow-md shrink-0">
                  <img src={facePhoto} alt="صورة الوجه" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-slate-100 border border-dashed border-slate-300 grid place-items-center text-slate-400 shrink-0">
                  <Camera className="h-7 w-7" />
                </div>
              )}

              <div className="flex-1 space-y-2">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  التقط صورة واضحة ومباشرة لوجهك بدون نظارات شمسية أو أقنعة
                </p>
                <div className="flex gap-2">
                  <input
                    ref={faceInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={handleFacePhotoChange}
                  />
                  <button
                    type="button"
                    onClick={() => faceInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold btn-press flex items-center gap-1.5 shadow"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{facePhoto ? "تغيير الصورة" : "التقاط صورة للوجه"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Official ID Card Photo */}
          <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-black text-sm">صورة الهوية الأصلية / إجازة السوق *</span>
              </div>
              {idCardPhoto && (
                <span className="text-[11px] font-bold text-emerald-600">تم الإرفاق ✓</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDocumentType("national_id")}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition btn-press border ${
                  documentType === "national_id"
                    ? "bg-sky-50 border-sky-400 text-sky-800"
                    : "bg-slate-50 border-border/60 text-muted-foreground"
                }`}
              >
                البطاقة الوطنية الموحدة
              </button>
              <button
                type="button"
                onClick={() => setDocumentType("driver_license")}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition btn-press border ${
                  documentType === "driver_license"
                    ? "bg-sky-50 border-sky-400 text-sky-800"
                    : "bg-slate-50 border-border/60 text-muted-foreground"
                }`}
              >
                إجازة السوق الأصلية
              </button>
            </div>

            <div className="flex items-center gap-4 pt-1">
              {idCardPhoto ? (
                <div className="relative h-20 w-28 rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-md shrink-0">
                  <img src={idCardPhoto} alt="صورة الهوية" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-20 w-28 rounded-2xl bg-slate-100 border border-dashed border-slate-300 grid place-items-center text-slate-400 shrink-0">
                  <Upload className="h-6 w-6" />
                </div>
              )}

              <div className="flex-1 space-y-2">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  صورة واضحة لوجه الهوية يظهر فيها الاسم الكامل ورقم الوثيقة بوضوح
                </p>
                <input
                  ref={idCardInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleIdCardChange}
                />
                <button
                  type="button"
                  onClick={() => idCardInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold btn-press flex items-center gap-1.5 shadow"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{idCardPhoto ? "استبدال صورة الهوية" : "إرفاق صورة الهوية"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Name Confirmation Checklist */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedNameMatch}
                onChange={(e) => setConfirmedNameMatch(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-emerald-600"
              />
              <span className="font-bold text-emerald-950 leading-relaxed">
                أؤكد بأن الاسم المكتوب أعلاه (
                <span className="text-primary">{legalName || "..."}</span>) يطابق تماماً الاسم في
                الهوية الأصلية المرفقة، وتتحمل كامل المسؤولية القانونية.
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Floating Bottom Action */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 backdrop-blur-md border-t border-border z-30">
        <button
          type="button"
          disabled={busy}
          onClick={activeStep === "car" ? () => setActiveStep("identity") : submit}
          className="w-full max-w-md mx-auto py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-black text-base shadow-xl btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : activeStep === "car" ? (
            <>
              <span>المتابعة لتأكيد الهوية والصورة</span>
              <ArrowLeft className="h-5 w-5" />
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              <span>تأكيد الهوية وتفعيل ملف الكابتن</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
