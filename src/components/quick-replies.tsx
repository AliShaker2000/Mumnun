import { useMemo } from "react";

type Role = "customer" | "provider";
type ReqType = "taxi" | "service";

const REPLIES: Record<Role, Record<ReqType, string[]>> = {
  customer: {
    taxi: [
      "وين وصلت؟",
      "كم تبقى دقيقة؟",
      "أنا واقف بالباب",
      "دك بوري لما توصل",
      "اتأخر شوية لو سمحت",
      "خذ يمين بعد الإشارة",
      "شكراً، الله يخليك",
      "ابعث موقعك الحالي",
    ],
    service: [
      "شكد تتأخر؟",
      "أنا بالبيت، تفضل",
      "دك الجرس لما توصل",
      "المشكلة صارت أسوأ",
      "جيب العدة وياك لو سمحت",
      "الأدوات المطلوبة عندك؟",
      "شكراً، الله يخليك",
      "ابعث موقعك الحالي",
    ],
  },
  provider: {
    taxi: [
      "أنا بالطريق",
      "وصلت لباب البيت",
      "بگه دقيقتين واوصل",
      "زحمة، أتأخر شوية",
      "أنا واگف بسيارة بيضة",
      "طلع لو سمحت",
      "أهلاً وسهلاً",
      "شكراً على الرحلة",
    ],
    service: [
      "أنا بالطريق إلك",
      "وصلت لباب البيت",
      "بگه دقيقتين واوصل",
      "زحمة، أتأخر شوية",
      "شبيك المشكلة بالضبط؟",
      "أحتاج معلومة إضافية",
      "الشغل خلص، تفضل شوف",
      "شكراً، بأمان الله",
    ],
  },
};

export function QuickReplies({
  role,
  type,
  onPick,
}: {
  role: Role;
  type: ReqType;
  onPick: (text: string) => void;
}) {
  const items = useMemo(() => REPLIES[role][type] ?? [], [role, type]);
  if (!items.length) return null;
  return (
    <div className="-mx-1 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 px-1 pb-1">
        {items.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="shrink-0 rounded-full border border-border bg-secondary/60 hover:bg-secondary text-foreground text-xs font-bold px-3 py-1.5 btn-press whitespace-nowrap"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
