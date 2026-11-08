import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import {
  Loader2,
  ArrowLeft,
  Award,
  Star,
  Camera,
  Upload,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  FileText,
  Check,
  Wrench,
} from "lucide-react";
import { grantProviderRole } from "@/lib/roles.functions";
import {
  fileToCompressedDataUrl,
  saveProviderVerification,
  getProviderVerification,
} from "@/lib/verification";

export const Route = createFileRoute("/onboarding/worker")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الفني وتأكيد الهوية | ممنون" },
      {
        name: "description",
        content: "سجل اختصاصاتك المهنية وأكد هويتك للانضمام إلى فنيي ممنون المعتمدين.",
      },
      { property: "og:title", content: "تسجيل الفني وتأكيد الهوية | ممنون" },
      {
        property: "og:description",
        content: "سجل اختصاصاتك المهنية وأكد هويتك للانضمام إلى فنيي ممنون المعتمدين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingWorker,
});

interface Service {
  id: string;
  name_ar: string;
  slug: string;
}

function OnboardingWorker() {
  const { session, profile, loading, refresh } = useAuth();
  const navigate = useNavigate();

  // Professional details
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<"fani" | "khabir">("fani");
  const [bio, setBio] = useState("");

  // Official Identity Verification
  const [legalName, setLegalName] = useState(profile?.full_name || "");
  const [facePhoto, setFacePhoto] = useState<string | null>(profile?.avatar_url || null);
  const [idCardPhoto, setIdCardPhoto] = useState<string | null>(null);
  const [confirmedNameMatch, setConfirmedNameMatch] = useState(true);

  const [activeTab, setActiveTab] = useState<"specialties" | "identity">("specialties");
  const [busy, setBusy] = useState(false);

  const faceInputRef = useRef<HTMLInputElement>(null);
  const idCardInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("services")
      .select("id, name_ar, slug")
      .order("sort_order")
      .then(({ data }) => setServices(data ?? []));
  }, []);

  // Load existing verification if available
  useEffect(() => {
    if (session?.user?.id) {
      const existing = getProviderVerification(session.user.id);
      if (existing) {
        if (existing.legalName) setLegalName(existing.legalName);
        if (existing.facePhotoUrl) setFacePhoto(existing.facePhotoUrl);
        if (existing.idCardPhotoUrl) setIdCardPhoto(existing.idCardPhotoUrl);
      }
    }
  }, [session?.user?.id]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;

  function toggleService(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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
    if (selected.size === 0) {
      toast.error("اختر اختصاص مهني واحد على الأقل");
      setActiveTab("specialties");
      return;
    }
    if (!legalName.trim() || legalName.trim().length < 5) {
      toast.error("يرجى كتابة الاسم الثلاثي الكامل المطابق للهوية الرسمية");
      setActiveTab("identity");
      return;
    }
    if (!facePhoto) {
      toast.error("يرجى التقاط صورة شخصية حقيقية لوجهك");
      setActiveTab("identity");
      return;
    }
    if (!idCardPhoto) {
      toast.error("يرجى إرفاق صورة الهوية الأصلية أو البطاقة الوطنية");
      setActiveTab("identity");
      return;
    }
    if (!confirmedNameMatch) {
      toast.error("يرجى تأكيد تطابق الاسم المكتوب مع الهوية المرفقة");
      return;
    }

    setBusy(true);
    try {
      const uid = session!.user.id;

      // 1. Update Profile with full legal name and face photo
      await supabase
        .from("profiles")
        .update({
          full_name: legalName.trim(),
          avatar_url: facePhoto,
        })
        .eq("id", uid);

      // 2. Save detailed verification record
      saveProviderVerification({
        userId: uid,
        role: "worker",
        legalName: legalName.trim(),
        facePhotoUrl: facePhoto,
        idCardPhotoUrl: idCardPhoto,
        documentType: "national_id",
        verifiedAt: new Date().toISOString(),
        status: "verified",
      });

      // 3. Upsert worker profile
      const { error: pErr } = await supabase.from("worker_profiles").upsert({
        user_id: uid,
        level,
        bio: bio.trim() || null,
        available: true,
      });
      if (pErr) throw pErr;

      // 4. Update worker specialties
      await supabase.from("worker_services").delete().eq("worker_id", uid);
      const rows = Array.from(selected).map((service_id) => ({
        worker_id: uid,
        service_id,
      }));
      const { error: sErr } = await supabase.from("worker_services").insert(rows);
      if (sErr) throw sErr;

      // 5. Grant worker role
      await grantProviderRole({ data: { role: "worker" } });
      localStorage.setItem("mumnun-active-role", "worker");
      await refresh();

      toast.success("تم تفعيل ملف الفني وتوثيق الهوية بنجاح! 🛠️");
      navigate({ to: "/home" });
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء حفظ الملف");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-36 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 grid place-items-center shadow-lg text-white">
          <Wrench className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black">تسجيل الفني والمهنة</h1>
          <p className="text-xs text-muted-foreground">تحديد الاختصاص وتأكيد الهوية وصورة الوجه</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("specialties")}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all btn-press flex items-center justify-center gap-1.5 ${
            activeTab === "specialties"
              ? "bg-white text-primary shadow-md scale-[1.01]"
              : "text-muted-foreground hover:bg-slate-200/60"
          }`}
        >
          <Wrench className="h-4 w-4" />
          <span>١. المستوى والاختصاص</span>
          {selected.size > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
              {selected.size}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("identity")}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all btn-press flex items-center justify-center gap-1.5 ${
            activeTab === "identity"
              ? "bg-white text-emerald-700 shadow-md scale-[1.01]"
              : "text-muted-foreground hover:bg-slate-200/60"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>٢. الهوية وصورة الوجه</span>
          {facePhoto && idCardPhoto && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
        </button>
      </div>

      {/* TAB 1: SPECIALTIES & LEVEL */}
      {activeTab === "specialties" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">المستوى المهني</div>
            <div className="grid grid-cols-2 gap-3">
              <LevelCard
                active={level === "fani"}
                onClick={() => setLevel("fani")}
                icon={<Star className="h-6 w-6" />}
                title="فني مهني"
                desc="خبرة عملية وإتقان في مجالك"
              />
              <LevelCard
                active={level === "khabir"}
                onClick={() => setLevel("khabir")}
                icon={<Award className="h-6 w-6" />}
                title="خبير معتمد"
                desc="خبرة واسعة وأولوية في الطلبات"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-4 border border-border/80 shadow-sm">
            <div className="text-xs font-bold text-muted-foreground mb-2">
              نبذة عن خبرتك المهنية (اختياري)
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="مثال: خبرة 7 سنوات في تصليح وصيانة أجهزة التبريد والسبالت والكهربائيات..."
              className="w-full bg-slate-50 border border-border rounded-2xl px-4 py-3 text-xs font-medium outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-black">اختر الاختصاصات والخدمات التي تقدمها *</h2>
              <span className="text-xs font-bold text-primary">{selected.size} محدد</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {services.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`p-3.5 rounded-2xl text-xs font-bold btn-press text-right transition-all flex items-center justify-between border ${
                      on
                        ? "bg-white ring-2 ring-primary border-primary text-primary shadow-md"
                        : "bg-white/80 border-border/70 hover:bg-white text-foreground"
                    }`}
                  >
                    <span className="truncate">{s.name_ar}</span>
                    {on ? (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-border shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (selected.size === 0) {
                toast.error("اختر اختصاص واحد على الأقل");
                return;
              }
              setActiveTab("identity");
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-black text-sm shadow-lg btn-press flex items-center justify-center gap-2"
          >
            <span>المتابعة لتوثيق الهوية وصورة الوجه</span>
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TAB 2: IDENTITY & REAL FACE PHOTO */}
      {activeTab === "identity" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-sm">توثيق هوية الفني المعتمد</div>
              <div className="mt-0.5 leading-relaxed text-[11px] text-emerald-800">
                لضمان مصداقية الفنيين وأمان المنازل، يتوجب إرفاق صورة حقيقية لوجهك وصورة لهويتك
                الرسمية، مع تطابق الاسم المكتوب.
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
                <span className="font-black text-sm">صورة الهوية الوطنية أو هوية الأحوال *</span>
              </div>
              {idCardPhoto && (
                <span className="text-[11px] font-bold text-emerald-600">تم الإرفاق ✓</span>
              )}
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
                  صورة واضحة لوجه الهوية يظهر فيها الاسم الكامل والصورة بوضوح
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

          {/* Confirmation Checkbox */}
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
                الهوية الرسمية المرفقة، وأتحمل كامل المسؤولية.
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
          onClick={activeTab === "specialties" ? () => setActiveTab("identity") : submit}
          className="w-full max-w-md mx-auto py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-white font-black text-base shadow-xl btn-press glow-primary disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : activeTab === "specialties" ? (
            <>
              <span>المتابعة لتوثيق الهوية والصورة</span>
              <ArrowLeft className="h-4 w-4" />
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              <span>تأكيد الهوية وتفعيل ملف الفني</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function LevelCard({ active, onClick, icon, title, desc }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-2xl flex flex-col items-start gap-2 btn-press transition-all border ${
        active
          ? "bg-white ring-2 ring-primary border-primary shadow-md scale-[1.02]"
          : "bg-white/80 border-border/70 hover:bg-white"
      }`}
    >
      <div
        className={`h-10 w-10 rounded-xl grid place-items-center ${
          active
            ? "bg-primary text-primary-foreground shadow"
            : "bg-slate-100 text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="text-right">
        <div className="font-black text-sm">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </button>
  );
}
